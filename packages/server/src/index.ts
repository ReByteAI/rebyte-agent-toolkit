import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import type { ContentfulStatusCode } from 'hono/utils/http-status'
import OpenAI from 'openai'
import type { AgentSession, AgentSessionInputParam } from 'openai/resources/beta/agents/agents'

export interface AgentAppOptions { apiKey: string; agentId: string; baseURL: string }
const maxFileSize = 5 * 1024 * 1024
const invalid = (message: string) => new HTTPException(400, { message })

/** Same-origin example proxy. Mount behind your application's user authentication. */
export function createAgentApp(options: AgentAppOptions) {
  if (!options.apiKey || !options.agentId || !options.baseURL) throw new Error('API key, Agent ID and base URL are required')
  const client = new OpenAI({ apiKey: options.apiKey, baseURL: options.baseURL, maxRetries: 0 })
  const sessions = client.beta.agents.sessions
  const app = new Hono()
  async function owned(id: string): Promise<AgentSession> {
    const session = await sessions.retrieve(id)
    if (session.agent.id !== options.agentId) throw new HTTPException(404, { message: 'Session not found' })
    return session
  }
  app.get('/api/health', c => c.json({ ok: true, api: 'agents', agentId: options.agentId }))
  app.post('/api/sessions', async c => {
    // This file-capable app explicitly requests an environment; no VM is
    // provisioned until a file operation or environment tool needs one.
    const session = await sessions.create({ agent_id: options.agentId, environment: { type: 'openai_hosted' } })
    return c.json(session, 201)
  })
  app.get('/api/sessions/:id', async c => c.json(await owned(c.req.param('id'))))
  app.delete('/api/sessions/:id', async c => {
    await owned(c.req.param('id'))
    return c.json(await sessions.delete(c.req.param('id')))
  })
  app.get('/api/sessions/:id/events', async c => {
    await owned(c.req.param('id'))
    const response = await sessions.events.stream(c.req.param('id'), { signal: c.req.raw.signal }).asResponse()
    return new Response(response.body, { headers: {
      'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', 'X-Accel-Buffering': 'no',
    } })
  })
  app.post('/api/sessions/:id/events', async c => {
    await owned(c.req.param('id'))
    const body: unknown = await c.req.json()
    if (!body || typeof body !== 'object' || !('events' in body) || !Array.isArray(body.events)) throw invalid('events must be an array')
    const key = c.req.header('Idempotency-Key')
    if (!key) throw invalid('Idempotency-Key is required')
    await sessions.events.create(c.req.param('id'), { events: body.events as AgentSessionInputParam[], 'Idempotency-Key': key })
    return c.body(null, 204)
  })
  app.get('/api/sessions/:id/items', async c => {
    await owned(c.req.param('id'))
    const items = []
    for await (const item of sessions.items.list(c.req.param('id'), { order: 'asc', limit: 100 })) items.push(item)
    return c.json({ data: items })
  })
  app.get('/api/sessions/:id/turns', async c => {
    await owned(c.req.param('id'))
    const turns = []
    for await (const turn of sessions.turns.list(c.req.param('id'), { order: 'asc', limit: 100 })) turns.push(turn)
    return c.json({ data: turns })
  })
  app.get('/api/sessions/:id/artifacts', async c => {
    await owned(c.req.param('id'))
    const artifacts = []
    for await (const artifact of sessions.artifacts.list(c.req.param('id'), { order: 'asc', limit: 100 })) artifacts.push(artifact)
    return c.json({ data: artifacts })
  })
  app.get('/api/sessions/:id/artifacts/:artifactId/content', async c => {
    await owned(c.req.param('id'))
    const params = { session_id: c.req.param('id') }
    const artifact = await sessions.artifacts.retrieve(c.req.param('artifactId'), params)
    const response = await sessions.artifacts.content(artifact.id, params)
    return new Response(response.body, { headers: {
      'Content-Type': 'application/octet-stream',
      'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(artifact.path.split('/').at(-1)!)}`,
      'Cache-Control': 'private, no-store',
    } })
  })
  app.post('/api/sessions/:id/files', async c => {
    const session = await owned(c.req.param('id'))
    if (session.environment.type !== 'openai_hosted') throw invalid('Session has no managed environment')
    const filename = c.req.query('filename')
    if (!filename || !filename.trim() || /[\\/\x00-\x1f]/.test(filename) || filename.length > 200) throw invalid('Invalid filename')
    const length = c.req.header('Content-Length')
    if (length !== undefined && (!/^\d+$/.test(length) || Number(length) > maxFileSize)) throw new HTTPException(413, { message: 'File exceeds the 5 MiB upload limit' })
    if (!c.req.raw.body) throw invalid('File body is required')
    const reader = c.req.raw.body.getReader()
    const chunks: Uint8Array[] = []
    let size = 0
    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        size += value.length
        if (size > maxFileSize) { await reader.cancel(); throw new HTTPException(413, { message: 'File exceeds the 5 MiB upload limit' }) }
        chunks.push(value)
      }
    } finally { reader.releaseLock() }
    const path = `/workspace/uploads/${crypto.randomUUID()}/${filename}`
    const bytes = new Uint8Array(size)
    let offset = 0
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length }
    let binary = ''
    for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192))
    // The file API enters the Session's lazy environment guard and writes once.
    const file = await client.beta.agents.environments.files.create(session.environment.id, { type: 'inline', path, data: btoa(binary) })
    return c.json({ ...file, session_id: session.id, filename, content_type: c.req.header('Content-Type') ?? 'application/octet-stream', max_file_size: maxFileSize }, 201)
  })
  app.onError((error, c) => {
    if (error instanceof HTTPException) return c.json({ error: { message: error.message } }, error.status)
    if (error instanceof SyntaxError) return c.json({ error: { message: 'Invalid JSON' } }, 400)
    if (error instanceof OpenAI.APIError) return c.json({ error: { message: error.message, code: error.code } }, (error.status >= 400 && error.status < 600 ? error.status : 502) as ContentfulStatusCode)
    console.error('Agents app request failed', error)
    return c.json({ error: { message: 'The example server failed' } }, 500)
  })
  return app
}
