import { RebyteAPIError } from './error.js'
import { RebyteConversation } from './conversation.js'
import { ConversationsResource } from './conversations.js'
import { ResponseStream } from './stream.js'
import type {
  CreateResponseParams,
  RebyteClientOptions,
  RebyteResponse,
  RequestOptions,
} from './types.js'

const DEFAULT_BASE_URL = 'https://api.rebyte.ai/v1'

function browserRuntime(): boolean {
  return typeof window !== 'undefined' && typeof window.document !== 'undefined'
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

async function apiError(response: globalThis.Response): Promise<RebyteAPIError> {
  const text = await response.text()
  let body: unknown = text
  try {
    body = JSON.parse(text)
  } catch {
    // Preserve a non-JSON gateway response as text.
  }
  const record = isRecord(body) ? body : null
  const nested = record && isRecord(record.error) ? record.error : null
  const message = nested && typeof nested.message === 'string'
    ? nested.message
    : record && typeof record.message === 'string'
      ? record.message
      : text.trim() || `HTTP ${response.status}`
  const code = nested && typeof nested.code === 'string' ? nested.code : null
  return new RebyteAPIError(response.status, message, code, body)
}

function assertResponse(value: unknown): RebyteResponse {
  if (!isRecord(value) || value.object !== 'response' || typeof value.id !== 'string') {
    throw new Error('Rebyte returned an invalid Response object')
  }
  return value as unknown as RebyteResponse
}

export class ResponsesResource {
  constructor(private readonly client: Rebyte) {}

  async create(
    params: CreateResponseParams & { stream: true },
    options?: RequestOptions,
  ): Promise<ResponseStream>
  async create(
    params: CreateResponseParams & { stream?: false },
    options?: RequestOptions,
  ): Promise<RebyteResponse>
  async create(
    params: CreateResponseParams,
    options: RequestOptions = {},
  ): Promise<RebyteResponse | ResponseStream> {
    const response = await this.client.request('/responses', {
      method: 'POST',
      body: JSON.stringify(params),
      headers: {
        Accept: params.stream === true ? 'text/event-stream' : 'application/json',
        ...(options.idempotencyKey
          ? { 'Idempotency-Key': options.idempotencyKey }
          : {}),
        ...options.headers,
      },
      ...(options.signal ? { signal: options.signal } : {}),
    })
    if (params.stream === true) return new ResponseStream(response)
    return assertResponse(await response.json())
  }

  async retrieve(responseId: string, options: RequestOptions = {}): Promise<RebyteResponse> {
    if (!responseId) throw new Error('responseId is required')
    const response = await this.client.request(`/responses/${encodeURIComponent(responseId)}`, {
      method: 'GET',
      ...(options.headers ? { headers: options.headers } : {}),
      ...(options.signal ? { signal: options.signal } : {}),
    })
    return assertResponse(await response.json())
  }
}

export class Rebyte {
  readonly responses: ResponsesResource
  readonly conversations: ConversationsResource
  readonly baseURL: string
  private readonly apiKey: string
  private readonly doFetch: typeof globalThis.fetch
  private readonly defaultHeaders: Record<string, string>

  constructor(options: RebyteClientOptions) {
    if (!options.apiKey) throw new Error('apiKey is required')
    if (browserRuntime() && options.dangerouslyAllowBrowser !== true) {
      throw new Error(
        'Refusing to expose a Rebyte organization API key in the browser. '
        + 'Call Rebyte from your server or set dangerouslyAllowBrowser only for an intentional local experiment.',
      )
    }
    this.apiKey = options.apiKey
    this.baseURL = (options.baseURL ?? DEFAULT_BASE_URL).replace(/\/+$/, '')
    const doFetch = options.fetch ?? globalThis.fetch
    if (!doFetch) throw new Error('No fetch implementation is available')
    // Cloudflare Workers requires the platform fetch to be called with its
    // native receiver. Wrapping it also prevents request() from accidentally
    // rebinding a custom fetch to the Rebyte client instance.
    this.doFetch = (input, init) => doFetch.call(globalThis, input, init)
    this.defaultHeaders = options.defaultHeaders ?? {}
    this.responses = new ResponsesResource(this)
    this.conversations = new ConversationsResource(this)
  }

  conversation(options: { model: string; id?: string }) {
    return new RebyteConversation(this, options)
  }

  async request(path: string, init: RequestInit): Promise<globalThis.Response> {
    const headers = new Headers(this.defaultHeaders)
    headers.set('Authorization', `Bearer ${this.apiKey}`)
    if (init.body) headers.set('Content-Type', 'application/json')
    new Headers(init.headers).forEach((value, key) => headers.set(key, value))
    const response = await this.doFetch(`${this.baseURL}${path}`, { ...init, headers })
    if (!response.ok) throw await apiError(response)
    return response
  }
}
