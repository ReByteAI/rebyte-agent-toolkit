import {
  AgentTransportError,
  parseResponseEventStream,
  type ResponseStreamEvent,
} from './responses.js'

export interface AgentTransportRequest {
  input: string
  conversationId: string | null
  signal: AbortSignal
}
export interface AgentTransport {
  stream(request: AgentTransportRequest): Promise<AsyncIterable<ResponseStreamEvent>>
  interrupt(conversationId: string): Promise<void>
}

export interface FetchTransportOptions {
  url: string
  interruptUrl: string
  fetch?: typeof globalThis.fetch
  headers?: Record<string, string> | (() => Promise<Record<string, string>> | Record<string, string>)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

async function fetchError(response: Response): Promise<AgentTransportError> {
  const text = await response.text()
  let body: unknown = text
  try {
    body = JSON.parse(text)
  } catch {
    // Preserve text responses from an application proxy.
  }
  const record = isRecord(body) ? body : null
  const nested = record && isRecord(record.error) ? record.error : null
  const message = nested && typeof nested.message === 'string'
    ? nested.message
    : record && typeof record.message === 'string'
      ? record.message
      : text.trim() || `HTTP ${response.status}`
  const code = nested && typeof nested.code === 'string' ? nested.code : null
  return new AgentTransportError(response.status, message, code, body)
}

/**
 * Browser-safe transport. It calls the application's own endpoint, which is responsible
 * for authenticating the user and forwarding the Responses SSE stream from Rebyte.
 */
export function createFetchTransport(options: FetchTransportOptions): AgentTransport {
  if (!options.url) throw new Error('url is required')
  if (!options.interruptUrl) throw new Error('interruptUrl is required')
  const doFetch = options.fetch ?? globalThis.fetch
  if (!doFetch) throw new Error('No fetch implementation is available')

  return {
    async stream(request) {
      const extraHeaders = typeof options.headers === 'function'
        ? await options.headers()
        : options.headers ?? {}
      const response = await doFetch(options.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'text/event-stream',
          ...extraHeaders,
        },
        body: JSON.stringify({
          input: request.input,
          ...(request.conversationId
            ? { conversation: request.conversationId }
            : {}),
        }),
        signal: request.signal,
      })
      if (!response.ok) throw await fetchError(response)
      if (!response.body) throw new Error('Application response stream has no body')
      return parseResponseEventStream(response.body)
    },
    async interrupt(conversationId) {
      const extraHeaders = typeof options.headers === 'function'
        ? await options.headers()
        : options.headers ?? {}
      const response = await doFetch(options.interruptUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...extraHeaders },
        body: JSON.stringify({ conversation: conversationId }),
      })
      if (!response.ok) throw await fetchError(response)
    },
  }
}
