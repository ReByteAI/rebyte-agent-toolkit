import '../load-env.js'
import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import type { ContentfulStatusCode } from 'hono/utils/http-status'
import OpenAI from 'openai'

const apiKey = process.env.REBYTE_API_KEY
const agentId = process.env.REBYTE_AGENT_ID
const baseURL = (
  process.env.REBYTE_API_URL
  ?? process.env.REBYTE_BASE_URL
  ?? 'https://api.rebyte.ai/v1'
).replace(/\/+$/, '')

if (!apiKey || !agentId) {
  throw new Error('Set REBYTE_API_KEY and REBYTE_AGENT_ID before starting the example')
}

const client = new OpenAI({
  apiKey,
  baseURL,
})
const app = new Hono()

app.get('/api/health', (context) => context.json({ ok: true }))

app.post('/api/responses', async (context) => {
  const body: unknown = await context.req.json()
  if (typeof body !== 'object' || body === null) {
    return context.json({ error: { message: 'Request body must be an object' } }, 400)
  }
  const input = Reflect.get(body, 'input')
  const conversation = Reflect.get(body, 'conversation')
  if (typeof input !== 'string' || input.trim() === '') {
    return context.json({ error: { message: 'input must be a non-empty string' } }, 400)
  }
  if (conversation !== undefined && typeof conversation !== 'string') {
    return context.json({ error: { message: 'conversation must be a string' } }, 400)
  }

  const response = await client.responses.create({
    model: agentId,
    input,
    stream: true,
    ...(conversation ? { conversation } : {}),
  }, { signal: context.req.raw.signal }).asResponse()

  return new Response(response.body, {
    headers: {
      'Cache-Control': 'no-cache, no-transform',
      'Content-Type': 'text/event-stream',
      'X-Accel-Buffering': 'no',
    },
  })
})

app.post('/api/conversations/interrupt', async (context) => {
  const body: unknown = await context.req.json()
  const conversation = typeof body === 'object' && body !== null
    ? Reflect.get(body, 'conversation')
    : undefined
  if (typeof conversation !== 'string' || !conversation) {
    return context.json({ error: { message: 'conversation must be a string' } }, 400)
  }
  if (!conversation.startsWith('conv_') || conversation.length <= 5) {
    return context.json({ error: { message: 'conversation must start with conv_' } }, 400)
  }
  const response = await fetch(
    `${baseURL}/sessions/${encodeURIComponent(conversation.slice(5))}/interrupt`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: context.req.raw.signal,
    },
  )
  return new Response(response.body, {
    status: response.status,
    headers: { 'Content-Type': response.headers.get('Content-Type') ?? 'application/json' },
  })
})

app.onError((error, context) => {
  if (error instanceof OpenAI.APIError) {
    return context.json({
      error: { message: error.message, code: error.code ?? null },
    }, (error.status >= 400 && error.status < 600 ? error.status : 502) as ContentfulStatusCode)
  }
  console.error(error)
  return context.json({ error: { message: 'The example server failed' } }, 500)
})

serve({
  fetch: app.fetch,
  hostname: '127.0.0.1',
  port: Number(process.env.PORT ?? 4101),
}, (info) => {
  console.log(`Rebyte example API listening on http://${info.address}:${info.port}`)
})
