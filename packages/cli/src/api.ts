import type { RebyteAgentRecord } from './manifest.js'

interface ApiErrorBody {
  error?: { message?: string; code?: string } | string
}

export class RebyteApiClient {
  private readonly baseUrl: string

  constructor(
    baseUrl: string,
    private readonly apiKey: string,
    private readonly fetcher: typeof fetch = fetch,
  ) {
    this.baseUrl = baseUrl.replace(/\/+$/, '')
  }

  async createAgent(payload: Record<string, unknown>): Promise<RebyteAgentRecord> {
    const body = await this.request('/v1/agents', {
      method: 'POST',
      body: JSON.stringify(payload),
    })
    return requireAgent(body)
  }

  async updateAgent(
    id: string,
    payload: Record<string, unknown>,
  ): Promise<RebyteAgentRecord> {
    const body = await this.request(`/v1/agents/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    })
    return requireAgent(body)
  }

  async getAgent(id: string): Promise<RebyteAgentRecord> {
    const body = await this.request(`/v1/agents/${encodeURIComponent(id)}`)
    return requireAgent(body)
  }

  private async request(path: string, init: RequestInit = {}): Promise<unknown> {
    const response = await this.fetcher(`${this.baseUrl}${path}`, {
      ...init,
      headers: {
        API_KEY: this.apiKey,
        Accept: 'application/json',
        ...(init.body === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...init.headers,
      },
    })
    const body = await response.json() as ApiErrorBody
    if (!response.ok) {
      const apiError = body.error
      const message = typeof apiError === 'string' ? apiError : apiError?.message
      throw new Error(message || `Rebyte API request failed with HTTP ${response.status}`)
    }
    return body
  }
}

function requireAgent(body: unknown): RebyteAgentRecord {
  if (typeof body !== 'object' || body === null || !('agent' in body)) {
    throw new Error('Rebyte API response did not include an agent')
  }
  const agent = (body as { agent?: unknown }).agent
  if (
    typeof agent !== 'object'
    || agent === null
    || typeof (agent as { id?: unknown }).id !== 'string'
  ) {
    throw new Error('Rebyte API returned an invalid agent')
  }
  return agent as RebyteAgentRecord
}
