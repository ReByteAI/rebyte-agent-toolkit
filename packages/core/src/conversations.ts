import type { Rebyte } from './client.js'
import type {
  ConversationInterruptResult,
  ConversationList,
  CreateConversationParams,
  ListConversationsParams,
  RebyteConversationObject,
  RequestOptions,
} from './types.js'

interface SessionObject {
  id: string
  object: 'session'
  agentId: string
  title: string
  status: 'idle' | 'running' | 'paused'
  createdAt: string
  updatedAt: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function conversationIdFromSessionId(sessionId: string): string {
  if (!sessionId) throw new Error('Session id is required')
  return `conv_${sessionId}`
}

export function sessionIdFromConversationId(conversationId: string): string {
  if (!conversationId.startsWith('conv_') || conversationId.length <= 5) {
    throw new Error('Conversation id must start with conv_')
  }
  return conversationId.slice(5)
}

function sessionFromUnknown(value: unknown): SessionObject {
  if (
    !isRecord(value)
    || value.object !== 'session'
    || typeof value.id !== 'string'
    || typeof value.agentId !== 'string'
    || typeof value.title !== 'string'
    || (value.status !== 'idle' && value.status !== 'running' && value.status !== 'paused')
    || typeof value.createdAt !== 'string'
    || typeof value.updatedAt !== 'string'
  ) {
    throw new Error('Rebyte returned an invalid Session object')
  }
  return value as unknown as SessionObject
}

function conversationFromSession(session: SessionObject): RebyteConversationObject {
  return {
    id: conversationIdFromSessionId(session.id),
    object: 'conversation',
    model: session.agentId,
    title: session.title,
    status: session.status,
    created_at: session.createdAt,
    updated_at: session.updatedAt,
  }
}

async function json(response: globalThis.Response): Promise<unknown> {
  return response.json()
}

export class ConversationsResource {
  constructor(private readonly client: Rebyte) {}

  async create(
    params: CreateConversationParams,
    options: RequestOptions = {},
  ): Promise<RebyteConversationObject> {
    if (!params.model) throw new Error('model is required')
    const response = await this.client.request('/sessions', {
      method: 'POST',
      body: JSON.stringify({
        agentId: params.model,
        ...(params.title ? { title: params.title } : {}),
      }),
      headers: {
        ...(options.idempotencyKey
          ? { 'Idempotency-Key': options.idempotencyKey }
          : {}),
        ...options.headers,
      },
      ...(options.signal ? { signal: options.signal } : {}),
    })
    const body = await json(response)
    if (!isRecord(body)) throw new Error('Rebyte returned an invalid Conversation envelope')
    return conversationFromSession(sessionFromUnknown(body.session))
  }

  async retrieve(
    conversationId: string,
    options: RequestOptions = {},
  ): Promise<RebyteConversationObject> {
    const sessionId = sessionIdFromConversationId(conversationId)
    const response = await this.client.request(`/sessions/${encodeURIComponent(sessionId)}`, {
      method: 'GET',
      ...(options.headers ? { headers: options.headers } : {}),
      ...(options.signal ? { signal: options.signal } : {}),
    })
    const body = await json(response)
    if (!isRecord(body)) throw new Error('Rebyte returned an invalid Conversation envelope')
    return conversationFromSession(sessionFromUnknown(body.session))
  }

  async list(
    params: ListConversationsParams = {},
    options: RequestOptions = {},
  ): Promise<ConversationList> {
    const query = new URLSearchParams()
    if (params.model) query.set('agentId', params.model)
    if (params.limit !== undefined) query.set('limit', String(params.limit))
    if (params.offset !== undefined) query.set('offset', String(params.offset))
    const suffix = query.size === 0 ? '' : `?${query.toString()}`
    const response = await this.client.request(`/sessions${suffix}`, {
      method: 'GET',
      ...(options.headers ? { headers: options.headers } : {}),
      ...(options.signal ? { signal: options.signal } : {}),
    })
    const body = await json(response)
    if (
      !isRecord(body)
      || !Array.isArray(body.data)
      || typeof body.total !== 'number'
      || typeof body.limit !== 'number'
      || typeof body.offset !== 'number'
    ) {
      throw new Error('Rebyte returned an invalid Conversation list')
    }
    return {
      data: body.data.map((session) => conversationFromSession(sessionFromUnknown(session))),
      total: body.total,
      limit: body.limit,
      offset: body.offset,
    }
  }

  async interrupt(
    conversationId: string,
    options: RequestOptions = {},
  ): Promise<ConversationInterruptResult> {
    const sessionId = sessionIdFromConversationId(conversationId)
    const response = await this.client.request(
      `/sessions/${encodeURIComponent(sessionId)}/interrupt`,
      {
        method: 'POST',
        ...(options.headers ? { headers: options.headers } : {}),
        ...(options.signal ? { signal: options.signal } : {}),
      },
    )
    const body = await json(response)
    if (
      !isRecord(body)
      || (body.status !== 'interrupting' && body.status !== 'no_turn')
    ) {
      throw new Error('Rebyte returned an invalid Conversation interrupt result')
    }
    return { status: body.status }
  }

  async delete(conversationId: string, options: RequestOptions = {}): Promise<void> {
    const sessionId = sessionIdFromConversationId(conversationId)
    await this.client.request(`/sessions/${encodeURIComponent(sessionId)}`, {
      method: 'DELETE',
      ...(options.headers ? { headers: options.headers } : {}),
      ...(options.signal ? { signal: options.signal } : {}),
    })
  }
}
