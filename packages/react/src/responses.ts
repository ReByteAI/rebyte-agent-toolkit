export interface ResponseMcpCall {
  id: string
  type: 'mcp_call'
  server_label: string
  name: string
  arguments: string
  output: string | null
  error: string | null
  status: 'in_progress' | 'completed' | 'incomplete' | 'failed'
  [key: string]: unknown
}

export type ResponseOutputItem = ResponseMcpCall | {
  id: string
  type: string
  [key: string]: unknown
}

export interface ResponseObject {
  id: string
  object: 'response'
  status: 'queued' | 'in_progress' | 'completed' | 'failed'
  output: ResponseOutputItem[]
  output_text: string
  error: { code: string; message: string } | null
  conversation: { id: string }
  [key: string]: unknown
}

export interface ResponseStreamEvent {
  type: string
  sequence_number: number
  response?: ResponseObject
  delta?: string
  message?: string
  item?: ResponseOutputItem
  [key: string]: unknown
}

export interface ToolCallState {
  id: string
  name: string
  serverLabel: string
  status: 'in_progress' | 'completed' | 'incomplete' | 'failed'
  arguments: string
  output: string | null
  error: string | null
}

export interface ResponseState {
  status: 'idle' | 'in_progress' | 'completed' | 'failed'
  responseId: string | null
  outputText: string
  response: ResponseObject | null
  error: string | null
  toolCalls: ToolCallState[]
  events: ResponseStreamEvent[]
}

export class AgentTransportError extends Error {
  readonly status: number
  readonly code: string | null
  readonly body: unknown

  constructor(status: number, message: string, code: string | null, body: unknown) {
    super(message)
    this.name = 'AgentTransportError'
    this.status = status
    this.code = code
    this.body = body
  }
}

export function createResponseState(): ResponseState {
  return {
    status: 'idle',
    responseId: null,
    outputText: '',
    response: null,
    error: null,
    toolCalls: [],
    events: [],
  }
}

function mcpCall(item: ResponseOutputItem): ResponseMcpCall | null {
  return item.type === 'mcp_call' ? item as ResponseMcpCall : null
}

function upsertToolCall(toolCalls: ToolCallState[], item: ResponseMcpCall): ToolCallState[] {
  const next: ToolCallState = {
    id: item.id,
    name: item.name,
    serverLabel: item.server_label,
    status: item.status,
    arguments: item.arguments,
    output: item.output,
    error: item.error,
  }
  const index = toolCalls.findIndex((tool) => tool.id === item.id)
  if (index < 0) return [...toolCalls, next]
  return toolCalls.map((tool, current) => current === index ? next : tool)
}

function eventResponse(event: ResponseStreamEvent): ResponseObject | null {
  return typeof event.response === 'object' && event.response !== null
    ? event.response
    : null
}

export function reduceResponseState(
  state: ResponseState,
  event: ResponseStreamEvent,
): ResponseState {
  let next: ResponseState = { ...state, events: [...state.events, event] }

  if (event.type === 'response.created' || event.type === 'response.in_progress') {
    const response = eventResponse(event)
    next = {
      ...next,
      status: 'in_progress',
      responseId: response?.id ?? state.responseId,
    }
  } else if (event.type === 'response.output_text.delta') {
    next = {
      ...next,
      status: 'in_progress',
      outputText: state.outputText + (typeof event.delta === 'string' ? event.delta : ''),
    }
  } else if (event.type === 'response.output_item.added' || event.type === 'response.output_item.done') {
    const item = typeof event.item === 'object' && event.item !== null
      ? mcpCall(event.item)
      : null
    if (item) next = { ...next, toolCalls: upsertToolCall(state.toolCalls, item) }
  } else if (event.type === 'response.completed') {
    const response = eventResponse(event)
    if (!response) throw new Error('response.completed did not include a Response object')
    next = {
      ...next,
      status: 'completed',
      responseId: response.id,
      outputText: response.output_text,
      response,
      error: null,
      toolCalls: response.output.reduce((calls, item) => {
        const tool = mcpCall(item)
        return tool ? upsertToolCall(calls, tool) : calls
      }, next.toolCalls),
    }
  } else if (event.type === 'response.failed') {
    const response = eventResponse(event)
    if (!response) throw new Error('response.failed did not include a Response object')
    next = {
      ...next,
      status: 'failed',
      responseId: response.id,
      response,
      error: response.error?.message ?? 'Response failed',
    }
  } else if (event.type === 'error') {
    next = {
      ...next,
      status: 'failed',
      error: typeof event.message === 'string' ? event.message : 'Responses stream failed',
    }
  }

  return next
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export async function* parseResponseEventStream(
  body: ReadableStream<Uint8Array>,
): AsyncGenerator<ResponseStreamEvent> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let dataLines: string[] = []

  const flush = (): ResponseStreamEvent | '[DONE]' | null => {
    if (dataLines.length === 0) return null
    const raw = dataLines.join('\n')
    dataLines = []
    if (raw === '[DONE]') return '[DONE]'
    let value: unknown
    try {
      value = JSON.parse(raw)
    } catch {
      throw new Error('Responses stream emitted invalid JSON')
    }
    if (!isRecord(value) || typeof value.type !== 'string') {
      throw new Error('Responses stream emitted an event without a type')
    }
    if (typeof value.sequence_number !== 'number') {
      throw new Error(`Responses event ${value.type} has no sequence_number`)
    }
    return value as unknown as ResponseStreamEvent
  }

  for (;;) {
    const { done, value } = await reader.read()
    buffer += decoder.decode(value, { stream: !done })
    let newline = buffer.indexOf('\n')
    while (newline >= 0) {
      const rawLine = buffer.slice(0, newline)
      buffer = buffer.slice(newline + 1)
      const line = rawLine.endsWith('\r') ? rawLine.slice(0, -1) : rawLine
      if (line === '') {
        const event = flush()
        if (event === '[DONE]') return
        if (event) yield event
      } else if (!line.startsWith(':')) {
        const colon = line.indexOf(':')
        const field = colon < 0 ? line : line.slice(0, colon)
        const fieldValue = colon < 0 ? '' : line.slice(colon + 1).replace(/^ /, '')
        if (field === 'data') dataLines.push(fieldValue)
      }
      newline = buffer.indexOf('\n')
    }
    if (done) break
  }

  if (buffer.length > 0) {
    const line = buffer.endsWith('\r') ? buffer.slice(0, -1) : buffer
    if (line.startsWith('data:')) dataLines.push(line.slice(5).replace(/^ /, ''))
  }
  const event = flush()
  if (event && event !== '[DONE]') yield event
}
