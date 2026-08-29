import assert from 'node:assert/strict'
import test from 'node:test'
import { Rebyte, type RebyteResponse } from '../src/index.js'

function response(id: string, previous: string | null): RebyteResponse {
  return {
    id,
    object: 'response',
    created_at: 1,
    status: 'completed',
    background: false,
    completed_at: 1,
    model: '00000000-0000-0000-0000-000000000001',
    output: [],
    output_text: id,
    previous_response_id: previous,
    error: null,
    incomplete_details: null,
    instructions: null,
    max_output_tokens: null,
    metadata: {},
    parallel_tool_calls: true,
    reasoning: null,
    store: true,
    temperature: null,
    text: { format: { type: 'text' } },
    tool_choice: 'auto',
    tools: [],
    top_p: null,
    truncation: 'disabled',
    usage: null,
    conversation: { id: 'conv_00000000-0000-0000-0000-000000000001' },
  }
}

test('creates a non-streaming Response with Bearer auth', async () => {
  const seen: Array<{ url: string; init: RequestInit | undefined }> = []
  const client = new Rebyte({
    apiKey: 'rbk_test',
    baseURL: 'https://example.test/v1/',
    fetch: async (url, init) => {
      seen.push({ url: String(url), init })
      return Response.json(response('resp_1', null))
    },
  })
  const result = await client.responses.create({
    model: '00000000-0000-0000-0000-000000000001',
    input: 'hello',
  })
  assert.equal(result.id, 'resp_1')
  assert.equal(seen[0]?.url, 'https://example.test/v1/responses')
  assert.equal(new Headers(seen[0]?.init?.headers).get('authorization'), 'Bearer rbk_test')
})

test('streams events once and exposes the final Response', async () => {
  const terminal = response('resp_2', null)
  const payload = [
    { type: 'response.created', sequence_number: 0, response: { ...terminal, status: 'in_progress' } },
    { type: 'response.output_text.delta', sequence_number: 1, delta: 'resp_2' },
    { type: 'response.completed', sequence_number: 2, response: terminal },
  ].map((event) => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`).join('') + 'data: [DONE]\n\n'
  const client = new Rebyte({
    apiKey: 'rbk_test',
    fetch: async () => new Response(payload, { headers: { 'content-type': 'text/event-stream' } }),
  })
  const stream = await client.responses.create({
    model: terminal.model,
    input: 'hello',
    stream: true,
  })
  const types = []
  for await (const event of stream) types.push(event.type)
  assert.deepEqual(types, ['response.created', 'response.output_text.delta', 'response.completed'])
  assert.equal((await stream.finalResponse()).id, 'resp_2')
  assert.throws(() => stream[Symbol.asyncIterator](), /only be consumed once/)
})

test('conversation helper carries previous_response_id between sends', async () => {
  const bodies: unknown[] = []
  const queued = [response('resp_first', null), response('resp_second', 'resp_first')]
  const client = new Rebyte({
    apiKey: 'rbk_test',
    fetch: async (_url, init) => {
      bodies.push(JSON.parse(String(init?.body)))
      const next = queued.shift()
      if (!next) throw new Error('unexpected request')
      return Response.json(next)
    },
  })
  const conversation = client.conversation({ model: '00000000-0000-0000-0000-000000000001' })
  await conversation.send('first')
  await conversation.send('second')
  assert.deepEqual(bodies, [
    { model: conversation.model, input: 'first' },
    { model: conversation.model, input: 'second', previous_response_id: 'resp_first' },
  ])
  assert.equal(conversation.snapshot().previousResponseId, 'resp_second')
})
