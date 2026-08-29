import assert from 'node:assert/strict'
import test from 'node:test'
import { parseResponseEventStream } from '../src/index.js'

function body(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder()
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk))
      controller.close()
    },
  })
}

test('parses chunked Responses SSE, comments, CRLF, and DONE', async () => {
  const stream = body([
    ': ping\r\nevent: response.created\r\ndata: {"type":"response.created",',
    '"sequence_number":0,"response":{"id":"resp_1"}}\r\n\r\n',
    'data: {"type":"response.output_text.delta","sequence_number":1,"delta":"Hi"}\n\n',
    'data: [DONE]\n\n',
  ])
  const events = []
  for await (const event of parseResponseEventStream(stream)) events.push(event)
  assert.deepEqual(events.map((event) => event.type), [
    'response.created',
    'response.output_text.delta',
  ])
})
test('rejects an event without sequence_number', async () => {
  const stream = body(['data: {"type":"response.created"}\n\n'])
  await assert.rejects(async () => {
    for await (const _event of parseResponseEventStream(stream)) {
      // consume
    }
  }, /sequence_number/)
})
