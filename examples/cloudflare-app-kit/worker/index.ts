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

interface FileReservation {
  id: string
  filename: string
  uploadUrl: string
  maxFileSize: number
}

function fileReservation(value: unknown): FileReservation {
  if (typeof value !== 'object' || value === null) {
    throw new Error('Rebyte file API returned a non-object response')
  }
  const id = Reflect.get(value, 'id')
  const filename = Reflect.get(value, 'filename')
  const uploadUrl = Reflect.get(value, 'uploadUrl')
  const maxFileSize = Reflect.get(value, 'maxFileSize')
  if (typeof id !== 'string' || !id) throw new Error('Rebyte file API returned no file ID')
  if (typeof filename !== 'string' || !filename) throw new Error('Rebyte file API returned no filename')
  if (typeof uploadUrl !== 'string' || !uploadUrl) throw new Error('Rebyte file API returned no upload URL')
  if (typeof maxFileSize !== 'number' || maxFileSize <= 0) {
    throw new Error('Rebyte file API returned no maximum file size')
  }
  return { id, filename, uploadUrl, maxFileSize }
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
  const filename = context.req.query('filename')
  const requestContentType = context.req.header('Content-Type')
  const contentType = requestContentType && requestContentType.trim()
    ? requestContentType
    : 'application/octet-stream'
  if (!filename || filename.trim() === '') {
    return context.json({ error: { message: 'filename must be a non-empty string' } }, 400)
  }
  if (!context.req.raw.body) {
    return context.json({ error: { message: 'File body is required' } }, 400)
  }

  const reservationResponse = await fetch(`${baseURL(context.env)}/files`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${requireBinding(context.env.REBYTE_API_KEY, 'REBYTE_API_KEY')}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ filename, contentType }),
    signal: context.req.raw.signal,
  })
  if (!reservationResponse.ok) {
    return new Response(reservationResponse.body, {
      status: reservationResponse.status,
      headers: {
        'Cache-Control': 'no-store',
        'Content-Type': reservationResponse.headers.get('Content-Type') || 'application/json',
      },
    })
  }
  const reservation = fileReservation(await reservationResponse.json())
  const contentLength = context.req.header('Content-Length')
  if (contentLength && Number(contentLength) > reservation.maxFileSize) {
    return context.json({ error: { message: 'File exceeds the upload limit' } }, 413)
  }

  const uploadInit: RequestInit & { duplex: 'half' } = {
    method: 'PUT',
    headers: { 'Content-Type': contentType },
    body: context.req.raw.body,
    signal: context.req.raw.signal,
    duplex: 'half',
  }
  const uploadResponse = await fetch(reservation.uploadUrl, uploadInit)
  if (!uploadResponse.ok) {
    console.error('Signed file upload failed', { status: uploadResponse.status })
    return context.json({ error: { message: 'Object storage rejected the file upload' } }, 502)
  }

  return context.json({
    id: reservation.id,
    filename: reservation.filename,
    contentType,
    maxFileSize: reservation.maxFileSize,
  }, 201)
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
