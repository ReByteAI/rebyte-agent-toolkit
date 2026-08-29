import type {
  RebyteResponse,
  ResponseMcpCall,
  ResponseOutputItem,
  ResponseStreamEvent,
} from './types.js'

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
  response: RebyteResponse | null
  error: string | null
  toolCalls: ToolCallState[]
  events: ResponseStreamEvent[]
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

function eventResponse(event: ResponseStreamEvent): RebyteResponse | null {
  const response = event.response
  return typeof response === 'object' && response !== null
    ? response as RebyteResponse
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
    const delta = typeof event.delta === 'string' ? event.delta : ''
    next = { ...next, status: 'in_progress', outputText: state.outputText + delta }
  } else if (event.type === 'response.output_item.added' || event.type === 'response.output_item.done') {
    const item = typeof event.item === 'object' && event.item !== null
      ? mcpCall(event.item as ResponseOutputItem)
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
