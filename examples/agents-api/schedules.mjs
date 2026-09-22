import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { workflowExample } from './workflow-helpers.mjs'

// An isolated, paused schedule with a one-run cap; never leaves a recurring timer.
const { client, rememberAgent, rememberRun, completed, cleanup } = workflowExample()
let schedule
try {
  const agent = rememberAgent(await client.workflowAgents.create({
    name: `Schedule extension recipe ${randomUUID()}`,
    code: 'async input => ({ total: input.quantity * input.price })',
    input_schema: {
      type: 'object', properties: { quantity: { type: 'number' }, price: { type: 'number' } },
      required: ['quantity', 'price'], additionalProperties: false,
    },
  }))
  const tested = completed(await client.workflowAgents.test(agent.id, {
    version: 1, input: { quantity: 3, price: 7 }, 'Idempotency-Key': randomUUID(),
  }))
  await client.workflowAgents.publish(agent.id, { version: 1, test_run_id: tested.id })
  schedule = await client.schedules.create({
    name: `Schedule recipe ${randomUUID()}`,
    target: { type: 'workflow', workflow_agent_id: agent.id, version: 1, input: { quantity: 4, price: 7 } },
    timing: { type: 'cron', expression: '0 9 * * *', timezone: 'UTC' },
    paused: true, max_runs: 1,
  })
  const request = { 'Idempotency-Key': randomUUID() }
  const trigger = await client.schedules.trigger(schedule.id, request)
  assert.equal((await client.schedules.trigger(schedule.id, request)).run_id, trigger.run_id)
  const deadline = Date.now() + 180_000
  let terminal
  while (Date.now() < deadline) {
    // Admission is asynchronous; the list can be empty before the run is persisted.
    const runs = await client.schedules.runs.list(schedule.id)
    const run = runs.data.find(item => item.id === trigger.run_id)
    if (run?.workflow_run_id) rememberRun({ id: run.workflow_run_id })
    if (run && ['completed', 'failed', 'cancelled', 'skipped'].includes(run.status)) {
      terminal = run
      break
    }
    await new Promise(resolve => setTimeout(resolve, 1000))
  }
  assert(terminal, 'Schedule did not settle before the deadline')
  assert.equal(terminal.status, 'completed', terminal.error)
  assert.deepEqual(terminal.result, { total: 28 })
  assert.equal((await client.schedules.runs.retrieve(schedule.id, terminal.id)).id, terminal.id)
  const saved = await client.schedules.retrieve(schedule.id)
  assert.equal(saved.run_count, 1)
  assert.equal(saved.paused, true)
  console.log('Schedule extension passed: published Workflow, paused manual trigger, idempotency, result, run listing and cap.')
} finally {
  try {
    if (schedule) {
      await client.schedules.pause(schedule.id)
      const deadline = Date.now() + 60_000
      while (true) {
        const detail = await client.schedules.retrieve(schedule.id)
        if (!detail.active_run_id) break
        await client.schedules.runs.cancel(schedule.id, detail.active_run_id)
        if (Date.now() >= deadline) throw new Error(`Cancel did not settle: ${schedule.id}`)
        await new Promise(resolve => setTimeout(resolve, 1000))
      }
      for await (const run of client.schedules.runs.list(schedule.id)) {
        if (run.workflow_run_id) rememberRun({ id: run.workflow_run_id })
      }
      await client.schedules.delete(schedule.id)
    }
  } finally {
    await cleanup()
  }
}
