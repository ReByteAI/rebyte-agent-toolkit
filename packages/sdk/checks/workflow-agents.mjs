// Protocol checks for boundaries that are easy to lose in generated clients.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import Rebyte, { APIError, WorkflowAgents, WorkflowVersionsPage } from '@rebyteai/agent-sdk'
import { WorkflowAgents as SubpathWorkflowAgents } from '@rebyteai/agent-sdk/resources/workflow-agents/index'
const require = createRequire(import.meta.url)
assert.equal(SubpathWorkflowAgents, WorkflowAgents)
assert.equal(typeof require('@rebyteai/agent-sdk').WorkflowAgents, 'function')
assert.equal(typeof WorkflowVersionsPage, 'function')

const requests = []
let respond
const client = new Rebyte({ apiKey: 'synthetic-workflow-key', baseURL: 'https://workflow.invalid/v1',
  maxRetries: 5,
  fetch: async (url, init) => {
    const request = { url: new URL(url), ...init, headers: new Headers(init.headers), body: init.body && JSON.parse(init.body) }
    assert.equal(request.headers.get('authorization'), 'Bearer synthetic-workflow-key')
    assert.equal(request.headers.get('openai-beta'), null)
    requests.push(request)
    return respond(request)
  },
})
const sse = (...events) => new Response(events.map(e => `event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`).join(''),
  { headers: { 'content-type': 'text/event-stream' } })
const definition = { code: 'async input => input', input_schema: {} }
respond = request => {
  assert.equal(request.headers.get('idempotency-key'), 'stable-request')
  assert.deepEqual(request.body, { ...definition, input: null, stream: true })
  return sse(
    { type: 'workflow.run.tool.failed', error: 'A recoverable tool failure', call_id: 'call_1' },
    { type: 'workflow.run.output', value: { recovered: true } },
    { type: 'workflow.run.completed', run: { status: 'completed', result: 42 } },
  )
}
const events = []
for await (const event of await client.workflowAgents.preview({ ...definition, input: null, stream: true, 'Idempotency-Key': 'stable-request' })) events.push(event)
assert.deepEqual(events.map(e => e.type), ['workflow.run.tool.failed', 'workflow.run.output', 'workflow.run.completed'])
assert.equal(events[2].run.result, 42)

// Transport/API errors still throw, including errors that arrive after HTTP headers.
respond = () => sse({ type: 'error', error: { message: 'authoring unavailable', code: 'authoring_not_configured' } })
await assert.rejects(async () => {
  for await (const _ of await client.workflowAgents.generate({ prompt: 'sum', stream: true })) {}
}, e => e instanceof APIError && e.code === 'authoring_not_configured')
respond = () => new Response('event: workflow.run.output\ndata: {broken\n\n', { headers: { 'content-type': 'text/event-stream' } })
await assert.rejects(async () => {
  for await (const _ of await client.workflowAgents.runs.events.stream('run_1')) {}
}, /malformed workflow event JSON/)

// A failed run is a resource, not a thrown HTTP error.
respond = () => sse({ type: 'workflow.run.failed', run: { status: 'failed', error: 'program error' } })
for await (const event of await client.workflowAgents.test('agent_1', { version: 1, input: {}, stream: true })) {
  assert.equal(event.run.status, 'failed')
}

// Ending a live iterator must abort before waiting for nested body cancellation.
let cancelled = false
respond = () => new Response(new ReadableStream({
  start(controller) { controller.enqueue(new TextEncoder().encode('event: workflow.run.output\ndata: {"type":"workflow.run.output","value":1}\n\n')) },
  cancel() { cancelled = true },
}), { headers: { 'content-type': 'text/event-stream' } })
const live = await client.workflowAgents.runs.events.stream('run_1')
for await (const _ of live) break
assert.equal(live.controller.signal.aborted, true)
await new Promise(resolve => setTimeout(resolve, 0))
assert.equal(cancelled, true)

// Version pagination must preserve request headers/options and use before, never after.
respond = request => {
  assert.equal(request.headers.get('x-test'), 'versions')
  assert.equal(request.url.searchParams.get('limit'), '1')
  assert.equal(request.url.searchParams.get('after'), null)
  const before = request.url.searchParams.get('before')
  const version = before === null ? 3 : Number(before) - 1
  return Response.json({ object: 'list', data: [{ version }], has_more: version > 1 })
}
const versions = []
for await (const v of client.workflowAgents.versions.list('agent_1', { limit: 1 }, { headers: { 'X-Test': 'versions' } })) versions.push(v.version)
assert.deepEqual(versions, [3, 2, 1])

respond = request => {
  assert.equal(request.url.searchParams.get('after'), '9223372036854775806')
  return sse({ type: 'workflow.run.completed', run: { status: 'completed' } })
}
for await (const _ of await client.workflowAgents.runs.events.stream('run_1', { after: '9223372036854775806' })) {}
respond = request => { assert.deepEqual(request.body, {}); return Response.json({ status: 'cancelled' }) }
assert.equal((await client.workflowAgents.runs.cancel('run_1')).status, 'cancelled')

// These POSTs must not duplicate generation, draft creation or code execution on ambiguous 5xxs.
respond = () => Response.json({ error: { message: 'temporary failure' } }, { status: 503 })
for (const operation of [
  () => client.workflowAgents.create({ name: 'test', ...definition }),
  () => client.workflowAgents.versions.create('agent_1', definition),
  () => client.workflowAgents.generate({ prompt: 'test' }),
  () => client.workflowAgents.preview({ ...definition, input: {} }),
  () => client.workflowAgents.test('agent_1', { version: 1, input: {} }),
  () => client.workflowAgents.runs.create('agent_1', { input: {} }),
]) {
  const before = requests.length
  await assert.rejects(operation, APIError)
  assert.equal(requests.length, before + 1)
}
console.log('Workflow SDK checks passed: exports, headers, streaming tool failures/API errors, abort, numeric pagination, 64-bit replay cursor, cancellation and retry policy.')
