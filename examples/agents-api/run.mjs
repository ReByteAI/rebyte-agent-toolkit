// Official SDK only. Every run owns and deletes its Agent and Session.
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import OpenAI from 'openai'
const mode = process.argv[2] ?? 'chat'
if (!['chat', 'functions', 'hosted'].includes(mode)) throw new Error('Choose chat, functions, or hosted')
const client = new OpenAI({ apiKey: process.env.REBYTE_API_KEY,
  baseURL: process.env.REBYTE_BASE_URL ?? 'https://api.rebyte.ai/v1', maxRetries: 0 })
const sessions = client.beta.agents.sessions
let agent, session
let calls = 0
try {
  agent = await client.beta.agents.create({ name: `Recipe ${mode} ${randomUUID()}`,
    model: process.env.REBYTE_MODEL ?? 'gpt-5.6-luna',
    instructions: 'Follow the user request. Use the provided tool when requested. Never invent tool results.',
    tools: mode === 'functions' ? [{ type: 'function', name: 'lookup_order',
      description: 'Look up an order in the application.', parameters: { type: 'object',
        properties: { order_id: { type: 'string' } }, required: ['order_id'], additionalProperties: false } }] : [],
  })
  const input = mode === 'chat' ? 'Reply exactly RECIPE_CHAT_OK.' : mode === 'functions'
    ? 'Call lookup_order for order demo-001 and report its delivery code.'
    : 'Read /workspace/input.txt using exec_command, then use apply_patch to create /workspace/outputs/result.txt with exactly the same bytes. Report the file contents.'
  session = await sessions.create({ agent_id: agent.id, input,
    ...(mode === 'hosted' ? { environment: { type: 'openai_hosted', files: [{ type: 'inline', path: '/workspace/input.txt', data: Buffer.from('RECIPE_FILE_OK\n').toString('base64') }] } } : {}),
  })
  // Durable polling is also useful after an SSE disconnect. It never resubmits input.
  const deadline = Date.now() + 180_000
  const handled = new Set()
  while (true) {
    session = await sessions.retrieve(session.id)
    if (session.status === 'failed') throw new Error(session.error ?? 'Session failed')
    if (session.status === 'requires_action') {
      const events = []
      for (const action of session.required_actions) {
        assert.equal(action.type, 'function_call')
        assert.equal(action.name, 'lookup_order')
        assert.deepEqual(action.arguments, { order_id: 'demo-001' })
        // A production host must authorize the shopper and validate every argument.
        // Persist call_id + result atomically with a write if the function has side effects.
        if (!handled.has(action.call_id)) { calls++; handled.add(action.call_id) }
        events.push({ type: 'agent.session.input.tool_result', turn_id: action.turn_id,
          call_id: action.call_id, success: true, output: JSON.stringify({ delivery_code: 'HOST_ORDER_OK' }) })
      }
      await sessions.events.create(session.id, { events, 'Idempotency-Key': `results-${events.map(e => e.call_id).join('-')}` })
    }
    if (session.status === 'idle') break
    if (Date.now() > deadline) throw new Error('Recipe timed out')
    await new Promise(resolve => setTimeout(resolve, 500))
  }
  const turns = []
  for await (const turn of sessions.turns.list(session.id)) turns.push(turn)
  assert.equal(turns.length, 1)
  assert.equal(turns[0].status, 'completed', JSON.stringify(turns[0].error))
  const items = []
  for await (const item of sessions.items.list(session.id, { order: 'asc' })) items.push(item)
  const answer = items.filter(i => i.type === 'message' && i.role === 'assistant')
    .flatMap(i => i.content.filter(c => c.type === 'output_text').map(c => c.text)).join('\n')
  assert.match(answer, new RegExp(mode === 'chat' ? 'RECIPE_CHAT_OK' : mode === 'functions' ? 'HOST_ORDER_OK' : 'RECIPE_FILE_OK'))
  if (mode !== 'hosted') assert.equal(session.environment.type, 'none')
  if (mode === 'functions') assert(calls > 0)
  if (mode === 'hosted') {
    const artifacts = await sessions.artifacts.list(session.id)
    const file = artifacts.data.find(a => a.path === '/workspace/outputs/result.txt')
    assert(file, 'Missing Artifact')
    assert.equal(await (await sessions.artifacts.content(file.id, { session_id: session.id })).text(), 'RECIPE_FILE_OK\n')
  }
  console.log(JSON.stringify({ mode, agent: agent.id, session: session.id, passed: true, functionCalls: calls }))
} finally {
  if (session) {
    await sessions.delete(session.id)
    await assert.rejects(sessions.retrieve(session.id), error => error.status === 404)
  }
  if (agent) await client.beta.agents.delete(agent.id)
  console.log('Test-owned resources deleted')
}
