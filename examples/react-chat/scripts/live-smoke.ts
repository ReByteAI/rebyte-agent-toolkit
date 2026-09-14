/** Real App Kit proxy -> Agents API -> Temporal/model -> Session Sandbox verification. */
import assert from 'node:assert/strict'
import { createAgentSessionTransport, type AgentSession } from '@rebyte/agent-react'

const baseURL = process.env.APP_KIT_URL ?? 'http://127.0.0.1:5101'
const transport = createAgentSessionTransport({ url: `${baseURL}/api/sessions` })
const sessions: AgentSession[] = []
async function turn(id: string, text: string) {
  const abort = new AbortController()
  const timer = setTimeout(() => abort.abort(), 180000)
  try {
    const events = await transport.subscribe(id, abort.signal)
    await transport.submit(id, [{ type: 'agent.session.input.message', input: [{ role: 'user', content: [{ type: 'input_text', text }] }] }], crypto.randomUUID())
    let output = ''
    let count = 0
    for await (const event of events) {
      count++
      assert(!event.type.startsWith('response.'))
      if (event.type === 'agent.session.turn.output_text.delta') output += event.delta
      if (event.type === 'agent.session.turn.failed') throw new Error(event.turn.error?.message ?? 'Turn failed')
      if (event.type === 'agent.session.turn.completed') return { output, count, turn: event.turn }
    }
    throw new Error('No completed turn')
  } finally { clearTimeout(timer); abort.abort() }
}
try {
  const a = await transport.create(); sessions.push(a)
  const b = await transport.create(); sessions.push(b)
  console.log(JSON.stringify({ createdTestSessions: sessions.map(session => session.id) }))
  assert.equal(a.environment.type, 'openai_hosted')
  assert.equal(b.environment.type, 'openai_hosted')
  assert.notEqual(a.environment.id, b.environment.id)
  const uploaded = await fetch(`${baseURL}/api/sessions/${a.id}/files?filename=proof.txt`, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: 'APP_KIT_UPLOAD_OK' })
  assert.equal(uploaded.status, 201)
  const file = await uploaded.json() as { path: string; session_id: string }
  assert.equal(file.session_id, a.id)
  const first = await turn(a.id, `Read ${JSON.stringify(file.path)} with the shell. Copy it to /workspace/outputs/proof.txt and write APP_KIT_PRIVATE to /workspace/private.txt. Reply with the uploaded file contents.`)
  assert.match(first.output, /APP_KIT_UPLOAD_OK/)
  const outputs = await transport.artifacts(a.id)
  const proof = outputs.find(output => output.path === '/workspace/outputs/proof.txt')
  assert(proof)
  const download = await fetch(transport.artifactURL(a.id, proof.id))
  assert.equal(download.status, 200)
  assert.equal((await download.text()).trim(), 'APP_KIT_UPLOAD_OK')
  const crossSession = await fetch(transport.artifactURL(b.id, proof.id))
  assert.equal(crossSession.status, 404)
  const second = await turn(a.id, 'Read /workspace/private.txt with the shell and reply with its contents.')
  assert.match(second.output, /APP_KIT_PRIVATE/)
  const independent = await turn(b.id, 'Run test ! -e /workspace/private.txt && echo APP_KIT_ISOLATED in the shell. Report its output.')
  assert.match(independent.output, /APP_KIT_ISOLATED/)
  const items = await transport.items(a.id)
  assert(items.some(item => item.type === 'command_execution' && item.status === 'completed'))
  assert.equal((await transport.turns(a.id)).length, 2)
  console.log(JSON.stringify({ ok: true, sessionId: a.id, independentSessionId: b.id, turns: 2, events: first.count + second.count, fileUpload: true, artifactDownload: true, crossSessionArtifactStatus: 404, isolated: true }, null, 2))
} finally {
  const cleanup = await Promise.allSettled(sessions.map(async session => {
    const response = await fetch(`${baseURL}/api/sessions/${session.id}`, { method: 'DELETE' })
    assert.equal(response.status, 200, `Test Session cleanup failed: ${session.id}`)
    assert.equal((await fetch(`${baseURL}/api/sessions/${session.id}`)).status, 404)
  }))
  const failures = cleanup.filter(result => result.status === 'rejected')
  if (failures.length) throw new AggregateError(failures.map(result => result.reason), 'Test resource cleanup incomplete')
  console.log(JSON.stringify({ cleanup: true, sessionsDeleted: sessions.length }))
}
