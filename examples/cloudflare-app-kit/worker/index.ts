import { Hono } from 'hono'
import type { ContentfulStatusCode } from 'hono/utils/http-status'
import OpenAI from 'openai'

interface Bindings {
  REBYTE_API_KEY: string
  REBYTE_AGENT_ID: string
  REBYTE_API_URL: string
}

const app = new Hono<{ Bindings: Bindings }>()

function requireBinding(value: string, name: string): string {
  if (!value) throw new Error(`${name} is not configured`)
  return value
}

function baseURL(env: Bindings): string {
  return requireBinding(env.REBYTE_API_URL, 'REBYTE_API_URL').replace(/\/+$/, '')
}

function client(env: Bindings): OpenAI {
  return new OpenAI({
    apiKey: requireBinding(env.REBYTE_API_KEY, 'REBYTE_API_KEY'),
    baseURL: baseURL(env),
  })
}

function responseInput(value: unknown): string | OpenAI.Responses.ResponseInput | null {
  if (typeof value === 'string') return value.trim() ? value : null
  if (Array.isArray(value) && value.length > 0) {
    return value as OpenAI.Responses.ResponseInput
  }
  return null
}

app.use('/api/*', async (context, next) => {
  await next()
  context.header('Cache-Control', 'no-store')
  context.header('X-Content-Type-Options', 'nosniff')
})

app.get('/api/health', (context) => context.json({
  ok: true,
  execution: 'openai-responses-sdk',
  runtime: 'cloudflare-workers',
}))

app.post('/api/responses', async (context) => {
  const body: unknown = await context.req.json()
  if (typeof body !== 'object' || body === null) {
    return context.json({ error: { message: 'Request body must be an object' } }, 400)
  }
  const input = responseInput(Reflect.get(body, 'input'))
  const conversation = Reflect.get(body, 'conversation')
  if (!input) {
    return context.json({ error: { message: 'input must be non-empty text or a Responses input array' } }, 400)
  }
  if (conversation !== undefined && typeof conversation !== 'string') {
    return context.json({ error: { message: 'conversation must be a string' } }, 400)
  }

  const response = await client(context.env).responses.create({
    model: requireBinding(context.env.REBYTE_AGENT_ID, 'REBYTE_AGENT_ID'),
    input,
    stream: true,
    ...(conversation ? { conversation } : {}),
  }, { signal: context.req.raw.signal }).asResponse()

  return new Response(response.body, {
    headers: {
      'Cache-Control': 'no-cache, no-transform',
      'Content-Type': 'text/event-stream',
      'X-Accel-Buffering': 'no',
      'X-Content-Type-Options': 'nosniff',
    },
  })
})

app.post('/api/files', async (context) => {
  const body: unknown = await context.req.json()
  if (typeof body !== 'object' || body === null) {
    return context.json({ error: { message: 'Request body must be an object' } }, 400)
  }
  const filename = Reflect.get(body, 'filename')
  const contentType = Reflect.get(body, 'contentType')
  if (typeof filename !== 'string' || filename.trim() === '') {
    return context.json({ error: { message: 'filename must be a non-empty string' } }, 400)
  }
  if (contentType !== undefined && typeof contentType !== 'string') {
    return context.json({ error: { message: 'contentType must be a string' } }, 400)
  }

  const response = await fetch(`${baseURL(context.env)}/files`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${requireBinding(context.env.REBYTE_API_KEY, 'REBYTE_API_KEY')}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      filename,
      ...(contentType ? { contentType } : {}),
    }),
    signal: context.req.raw.signal,
  })

  return new Response(response.body, {
    status: response.status,
    headers: {
      'Cache-Control': 'no-store',
      'Content-Type': response.headers.get('Content-Type') || 'application/json',
      'X-Content-Type-Options': 'nosniff',
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
    `${baseURL(context.env)}/sessions/${encodeURIComponent(conversation.slice(5))}/interrupt`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${requireBinding(context.env.REBYTE_API_KEY, 'REBYTE_API_KEY')}`,
      },
      signal: context.req.raw.signal,
    },
  )
  return new Response(response.body, {
    status: response.status,
    headers: {
      'Cache-Control': 'no-store',
      'Content-Type': response.headers.get('Content-Type') || 'application/json',
      'X-Content-Type-Options': 'nosniff',
    },
  })
})

app.onError((error, context) => {
  if (error instanceof OpenAI.APIError) {
    return context.json({
      error: { message: error.message, code: error.code || null },
    }, (error.status >= 400 && error.status < 600 ? error.status : 502) as ContentfulStatusCode)
  }
  console.error(error)
  return context.json({ error: { message: 'The App Server failed' } }, 500)
})

export default app
