import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { workflowExample } from './workflow-helpers.mjs'

const { client, rememberAgent, consume, cleanup } = workflowExample()
try {
  // Rebyte's official Workflow Builder generates the draft. No customer Managed Agent or model key is needed.
  let draft
  const generation = await client.workflowAgents.generate({
    prompt: 'Create a workflow named Order total. Input is an object with required numeric quantity and price, no extra properties. Return exactly {total: quantity * price}. Emit progress with await emit. Example input: {quantity: 3, price: 7}. No tools.',
    stream: true,
  })
  for await (const event of generation) {
    if (event.type === 'generation.delta') process.stdout.write(event.delta)
    if (event.type === 'generation.completed') draft = event.draft
  }
  if (!draft) throw new Error('Generation ended before a completed draft')
  console.log('\nGenerated:', draft.name)
  // In an application, show this code/schema to the user for review before executing it.
  const definition = { code: draft.code, input_schema: draft.input_schema }
  const preview = await consume(await client.workflowAgents.preview({
    ...definition, input: { quantity: 3, price: 7 }, stream: true, 'Idempotency-Key': randomUUID(),
  }))
  assert.deepEqual(preview.result, { total: 21 })
  const agent = rememberAgent(await client.workflowAgents.create({ name: draft.name, ...definition }))
  const tested = await consume(await client.workflowAgents.test(agent.id, {
    version: 1, input: { quantity: 3, price: 7 }, stream: true, 'Idempotency-Key': randomUUID(),
  }))
  assert.deepEqual(tested.result, { total: 21 })
  await client.workflowAgents.publish(agent.id, { version: 1, test_run_id: tested.id })
  const run = await consume(await client.workflowAgents.runs.create(agent.id, {
    input: { quantity: 4, price: 7 }, stream: true, 'Idempotency-Key': randomUUID(),
  }))
  assert.deepEqual(run.result, { total: 28 })
  console.log('Generated Workflow Agent passed:', run.result)
} finally {
  await cleanup()
}
