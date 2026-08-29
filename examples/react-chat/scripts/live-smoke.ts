import '../load-env.js'
import assert from 'node:assert/strict'
import OpenAI from 'openai'

const apiKey = process.env.REBYTE_API_KEY
const agentId = process.env.REBYTE_AGENT_ID
const baseURL = process.env.REBYTE_API_URL ?? process.env.REBYTE_BASE_URL
if (!apiKey || !agentId) {
  throw new Error('Set REBYTE_API_KEY and REBYTE_AGENT_ID to run the live smoke test')
}
const model = agentId

const client = new OpenAI({
  apiKey,
  ...(baseURL ? { baseURL } : {}),
})
let conversationId: string | null = null

async function runTurn(input: string) {
  const eventTypes: string[] = []
  let streamedText = ''
  let response: OpenAI.Responses.Response | null = null
  const stream = await client.responses.create({
    model,
    input,
    stream: true,
    ...(conversationId ? { conversation: conversationId } : {}),
  })
  for await (const event of stream) {
    eventTypes.push(event.type)
    if (event.type === 'response.output_text.delta' && typeof event.delta === 'string') {
      streamedText += event.delta
    }
    if (event.type === 'response.completed') response = event.response
    if (event.type === 'response.failed') {
      throw new Error(event.response.error?.message ?? 'Response failed')
    }
  }
  assert.ok(response, 'Stream ended without response.completed')
  assert.equal(response.status, 'completed')
  assert.equal(response.output_text, streamedText)
  assert.ok(eventTypes.includes('response.created'))
  assert.ok(eventTypes.includes('response.output_text.delta'))
  assert.equal(eventTypes.at(-1), 'response.completed')
  assert.ok(response.conversation?.id, 'Response did not include a Conversation ID')
  conversationId = response.conversation.id
  return { response, eventCount: eventTypes.length }
}

const first = await runTurn('Reply with exactly SDK_STREAM_OK and nothing else.')
assert.match(first.response.output_text, /SDK_STREAM_OK/)
assert.equal(conversationId, first.response.conversation?.id)

const second = await runTurn('Reply with exactly SDK_CONTEXT_OK and nothing else.')
assert.match(second.response.output_text, /SDK_CONTEXT_OK/)
assert.equal(second.response.conversation?.id, first.response.conversation?.id)
assert.equal(second.response.previous_response_id, null)

console.log(JSON.stringify({
  ok: true,
  firstResponseId: first.response.id,
  secondResponseId: second.response.id,
  conversationId,
  firstEventCount: first.eventCount,
  secondEventCount: second.eventCount,
}, null, 2))
