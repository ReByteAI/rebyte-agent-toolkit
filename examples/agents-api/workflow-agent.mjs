import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { workflowExample } from './workflow-helpers.mjs'

// Fixed code: no model and no Sandbox. Run after building the extension package from this checkout.
const { client, rememberAgent, completed, consume, cleanup } = workflowExample()
const definition = {
  code: `async (input, emit) => {
    await emit({ phase: 'calculating' });
    return { total: input.quantity * input.price };
  }`,
  input_schema: {
    type: 'object',
    properties: { quantity: { type: 'number' }, price: { type: 'number' } },
    required: ['quantity', 'price'], additionalProperties: false,
  },
}
try {
  const preview = completed(await client.workflowAgents.preview({
    ...definition, input: { quantity: 3, price: 7 }, 'Idempotency-Key': randomUUID(),
  }))
  assert.deepEqual(preview.result, { total: 21 })

  const agent = rememberAgent(await client.workflowAgents.create({ name: 'SDK order total', ...definition }))
  assert.equal(agent.published_version, null)
  const tested = await consume(await client.workflowAgents.test(agent.id, {
    version: 1, input: { quantity: 3, price: 7 }, stream: true, 'Idempotency-Key': randomUUID(),
  }))
  assert.deepEqual(tested.result, { total: 21 })
  await client.workflowAgents.publish(agent.id, { version: 1, test_run_id: tested.id })

  const request = { input: { quantity: 4, price: 7 }, 'Idempotency-Key': randomUUID() }
  const run = await consume(await client.workflowAgents.runs.create(agent.id, { ...request, stream: true }))
  assert.deepEqual(run.result, { total: 28 })
  // Same key/body returns the same run; stream is not part of the idempotency fingerprint.
  const replay = completed(await client.workflowAgents.runs.create(agent.id, request))
  assert.equal(replay.id, run.id)

  let sequence = '0'
  for await (const event of await client.workflowAgents.runs.events.stream(run.id, { after: sequence })) {
    sequence = event.sequence // Store this string for later reconnects, without converting to Number.
  }
  const remaining = []
  for await (const event of await client.workflowAgents.runs.events.stream(run.id, { after: sequence })) remaining.push(event)
  assert.equal(remaining.length, 0)

  const v2 = await client.workflowAgents.versions.create(agent.id, {
    base_version: 1,
    code: `async input => ({ total: input.quantity * input.price, currency: 'USD' })`,
    input_schema: definition.input_schema,
  })
  assert.equal(v2.version, 2)
  assert.equal((await client.workflowAgents.retrieve(agent.id)).published_version, 1)
  const versions = []
  for await (const version of client.workflowAgents.versions.list(agent.id, { limit: 1 })) versions.push(version.version)
  assert.deepEqual(versions, [2, 1]) // Automatic pagination uses before=<version>.
  assert.equal((await client.workflowAgents.versions.retrieve(agent.id, 2)).published_at, null)

  const v2Test = completed(await client.workflowAgents.test(agent.id, {
    version: 2, input: request.input, 'Idempotency-Key': randomUUID(),
  }))
  assert.deepEqual(v2Test.result, { total: 28, currency: 'USD' })
  await client.workflowAgents.publish(agent.id, { version: 2, test_run_id: v2Test.id })
  const latest = completed(await client.workflowAgents.runs.create(agent.id, {
    input: request.input, 'Idempotency-Key': randomUUID(),
  }))
  assert.deepEqual(latest.result, { total: 28, currency: 'USD' })
  const pinned = completed(await client.workflowAgents.runs.create(agent.id, {
    version: 1, input: request.input, 'Idempotency-Key': randomUUID(),
  }))
  assert.deepEqual(pinned.result, { total: 28 })
  console.log('Workflow Agent passed: preview, create, test, publish, stream, idempotency, replay, versions and pinned execution.')
} finally {
  // A real application keeps its Agent; this recipe deletes only what it created.
  await cleanup()
}
