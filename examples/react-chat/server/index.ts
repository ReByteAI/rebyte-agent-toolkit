import '../load-env.js'
import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import type { ContentfulStatusCode } from 'hono/utils/http-status'
import { Rebyte, RebyteAPIError } from '@rebyte/agent-sdk'

const apiKey = process.env.REBYTE_API_KEY
const agentId = process.env.REBYTE_AGENT_ID
const baseURL = process.env.REBYTE_API_URL ?? process.env.REBYTE_BASE_URL

if (!apiKey || !agentId) {
  throw new Error('Set REBYTE_API_KEY and REBYTE_AGENT_ID before starting the example')
}

const client = new Rebyte({
  apiKey,
  ...(baseURL ? { baseURL } : {}),
})
const app = new Hono()

app.get('/api/health', (context) => context.json({ ok: true }))

app.post('/api/responses', async (context) => {
  const body: unknown = await context.req.json()
  if (typeof body !== 'object' || body === null) {
    return context.json({ error: { message: 'Request body must be an object' } }, 400)
  }
  const input = Reflect.get(body, 'input')
  const previousResponseId = Reflect.get(body, 'previous_response_id')
  if (typeof input !== 'string' || input.trim() === '') {
    return context.json({ error: { message: 'input must be a non-empty string' } }, 400)
  }
  if (previousResponseId !== undefined && typeof previousResponseId !== 'string') {
    return context.json({ error: { message: 'previous_response_id must be a string' } }, 400)
  }

  const stream = await client.responses.create({
    model: agentId,
    input,
    stream: true,
    ...(previousResponseId ? { previous_response_id: previousResponseId } : {}),
  }, { signal: context.req.raw.signal })

  return new Response(stream.response.body, {
    headers: {
      'Cache-Control': 'no-cache, no-transform',
      'Content-Type': 'text/event-stream',
      'X-Accel-Buffering': 'no',
    },
  })
})

app.onError((error, context) => {
  if (error instanceof RebyteAPIError) {
    return context.json({
      error: { message: error.message, code: error.code },
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
