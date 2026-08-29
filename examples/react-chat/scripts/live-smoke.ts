import '../load-env.js'
import assert from 'node:assert/strict'
import { Rebyte, type ResponseStreamEvent } from '@rebyte/agent-sdk'

const apiKey = process.env.REBYTE_API_KEY
const agentId = process.env.REBYTE_AGENT_ID
const baseURL = process.env.REBYTE_API_URL ?? process.env.REBYTE_BASE_URL
if (!apiKey || !agentId) {
  throw new Error('Set REBYTE_API_KEY and REBYTE_AGENT_ID to run the live smoke test')
}

const client = new Rebyte({
  apiKey,
  ...(baseURL ? { baseURL } : {}),
})
const conversation = client.conversation({ model: agentId })

async function runTurn(input: string) {
  const events: ResponseStreamEvent[] = []
  let streamedText = ''
  const stream = await conversation.stream(input)
  for await (const event of stream) {
    events.push(event)
    if (event.type === 'response.output_text.delta' && typeof event.delta === 'string') {
      streamedText += event.delta
    }
  }
  const response = await stream.finalResponse()
  assert.equal(response.status, 'completed')
  assert.equal(response.output_text, streamedText)
  assert.ok(events.some((event) => event.type === 'response.created'))
  assert.ok(events.some((event) => event.type === 'response.output_text.delta'))
  assert.equal(events.at(-1)?.type, 'response.completed')
  return { response, eventCount: events.length }
}

const first = await runTurn('Reply with exactly SDK_STREAM_OK and nothing else.')
assert.match(first.response.output_text, /SDK_STREAM_OK/)
assert.equal(conversation.snapshot().previousResponseId, first.response.id)

const second = await runTurn('Reply with exactly SDK_CONTEXT_OK and nothing else.')
assert.match(second.response.output_text, /SDK_CONTEXT_OK/)
assert.equal(second.response.previous_response_id, first.response.id)

console.log(JSON.stringify({
  ok: true,
  firstResponseId: first.response.id,
  secondResponseId: second.response.id,
  firstEventCount: first.eventCount,
  secondEventCount: second.eventCount,
}, null, 2))
