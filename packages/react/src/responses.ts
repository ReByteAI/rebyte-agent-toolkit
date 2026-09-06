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

export interface ResponseMessage {
  id: string
  type: 'message'
  status: 'in_progress' | 'completed' | 'incomplete'
  role: 'assistant'
  phase?: 'commentary' | 'final_answer' | null
  content: Array<{ type: 'output_text'; text: string; annotations: unknown[] }>
}

export interface ResponseFunctionCall {
  id: string
  type: 'function_call'
  name: string
  call_id: string
  arguments: string
  status: 'in_progress' | 'completed' | 'incomplete'
}

export type ResponseOutputItem = ResponseMcpCall | ResponseMessage | ResponseFunctionCall

export interface ResponseUsage {
  input_tokens: number
  output_tokens: number
  total_tokens: number
  input_tokens_details: { cached_tokens: number; cache_write_tokens: number }
  output_tokens_details: { reasoning_tokens: number }
}

export interface ResponseObject {
  id: string
  object: 'response'
  status: 'queued' | 'in_progress' | 'completed' | 'failed'
  output: ResponseOutputItem[]
  output_text: string
  usage: ResponseUsage | null
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
  outputIndex: number
  execution: 'server' | 'client'
  callId: string | null
  name: string
  serverLabel: string
  status: 'in_progress' | 'completed' | 'incomplete' | 'failed' | 'awaiting_output'
  arguments: string
  output: string | null
  error: string | null
}

export interface TextMessageState {
  id: string
  outputIndex: number
  text: string
  phase: 'commentary' | 'final_answer' | null
  status: 'in_progress' | 'completed' | 'incomplete'
}

export interface ResponseState {
  status: 'idle' | 'in_progress' | 'completed' | 'failed'
  responseId: string | null
  outputText: string
  textMessages: TextMessageState[]
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
    textMessages: [],
    response: null,
    error: null,
    toolCalls: [],
    events: [],
  }
}

function upsertToolCall(toolCalls: ToolCallState[], item: ResponseMcpCall | ResponseFunctionCall, outputIndex: number): ToolCallState[] {
  const next: ToolCallState = {
    id: item.id,
    outputIndex,
    execution: item.type === 'function_call' ? 'client' : 'server',
    callId: item.type === 'function_call' ? item.call_id : null,
    name: item.name,
    serverLabel: item.type === 'function_call' ? 'client' : item.server_label,
    status: item.type === 'function_call' && item.status === 'completed' ? 'awaiting_output' : item.status,
    arguments: item.arguments,
    output: item.type === 'function_call' ? null : item.output,
    error: item.type === 'function_call' ? null : item.error,
  }
  const index = toolCalls.findIndex((tool) => tool.id === item.id)
  if (index < 0) return [...toolCalls, next]
  return toolCalls.map((tool, current) => current === index ? next : tool)
}

function eventResponse(event: ResponseStreamEvent): ResponseObject {
  if (typeof event.response !== 'object' || event.response === null) throw new Error(`${event.type} has no Response object`)
  return event.response
}

function outputIndex(event: ResponseStreamEvent): number {
  if (typeof event.output_index !== 'number' || !Number.isSafeInteger(event.output_index) || event.output_index < 0) throw new Error(`${event.type} has no output_index`)
  return event.output_index
}

function textMessage(item: ResponseMessage, index: number): TextMessageState {
  return { id: item.id, outputIndex: index, text: item.content.map(part => part.text).join(''),
    phase: item.phase === undefined ? null : item.phase, status: item.status }
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
      responseId: response.id,
    }
  } else if (event.type === 'response.output_text.delta') {
    if (typeof event.delta !== 'string' || event.content_index !== 0) throw new Error('Invalid text delta')
    const index = outputIndex(event)
    const message = state.textMessages.find(item => item.id === event.item_id && item.outputIndex === index)
    if (message === undefined || message.status !== 'in_progress') throw new Error('Text delta has no open message')
    const textMessages = state.textMessages.map(item => item.id === message.id ? { ...item, text: item.text + event.delta } : item)
    next = {
      ...next,
      status: 'in_progress',
      textMessages,
      outputText: textMessages.map(item => item.text).join(''),
    }
  } else if (event.type === 'response.output_text.done') {
    const message = state.textMessages.find(item => item.id === event.item_id && item.outputIndex === outputIndex(event))
    if (message === undefined || event.content_index !== 0 || message.text !== event.text) throw new Error('Text completion does not match deltas')
  } else if (event.type === 'response.mcp_call_arguments.delta' || event.type === 'response.function_call_arguments.delta') {
    const tool = state.toolCalls.find(item => item.id === event.item_id && item.outputIndex === outputIndex(event))
    if (tool === undefined || typeof event.delta !== 'string') throw new Error('Tool arguments delta has no open tool')
    next.toolCalls = state.toolCalls.map(item => item.id === tool.id ? { ...item, arguments: item.arguments + event.delta } : item)
  } else if (event.type === 'response.mcp_call_arguments.done' || event.type === 'response.function_call_arguments.done') {
    const tool = state.toolCalls.find(item => item.id === event.item_id && item.outputIndex === outputIndex(event))
    if (tool === undefined || tool.arguments !== event.arguments) throw new Error('Tool arguments completion does not match deltas')
  } else if (event.type === 'response.output_item.added' || event.type === 'response.output_item.done') {
    const item = event.item
    if (item === undefined) throw new Error(`${event.type} has no output item`)
    const index = outputIndex(event)
    if (item.type === 'mcp_call' || item.type === 'function_call') {
      next = { ...next, toolCalls: upsertToolCall(state.toolCalls, item, index) }
    } else if (item.type === 'message') {
      const message = textMessage(item, index)
      const existing = state.textMessages.find(text => text.id === item.id)
      if (event.type === 'response.output_item.added') {
        if (existing !== undefined) throw new Error('Duplicate message output item')
        next.textMessages = [...state.textMessages, message]
      } else {
        if (existing === undefined || existing.outputIndex !== index || existing.text !== message.text) throw new Error('Completed message does not match streamed text')
        next.textMessages = state.textMessages.map(text => text.id === item.id ? message : text)
      }
      next.outputText = next.textMessages.map(text => text.text).join('')
    }
  } else if (event.type === 'response.completed') {
    const response = eventResponse(event)
    const messages = response.output.flatMap((item, index) => item.type === 'message' ? [textMessage(item, index)] : [])
    if (JSON.stringify(messages) !== JSON.stringify(state.textMessages) || response.output_text !== state.outputText) throw new Error('Completed Response does not match streamed messages')
    next = {
      ...next,
      status: 'completed',
      responseId: response.id,
      outputText: response.output_text,
      textMessages: messages,
      response,
      error: null,
      toolCalls: response.output.reduce<ToolCallState[]>((calls, item, index) =>
        item.type === 'mcp_call' || item.type === 'function_call' ? upsertToolCall(calls, item, index) : calls, []),
    }
  } else if (event.type === 'response.failed') {
    const response = eventResponse(event)
    if (response.error === null) throw new Error('Failed Response has no error')
    next = {
      ...next,
      status: 'failed',
      responseId: response.id,
      response,
      error: response.error.message,
      toolCalls: response.output.reduce<ToolCallState[]>((calls, item, index) =>
        item.type === 'mcp_call' || item.type === 'function_call' ? upsertToolCall(calls, item, index) : calls, []),
    }
  } else if (event.type === 'error') {
    if (typeof event.message !== 'string') throw new Error('Stream error has no message')
    next = {
      ...next,
      status: 'failed',
      error: event.message,
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
  let lastSequence = -1

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
    if (typeof value.sequence_number !== 'number' || !Number.isSafeInteger(value.sequence_number) || value.sequence_number <= lastSequence) {
      throw new Error(`Responses event ${value.type} has an invalid sequence_number`)
    }
    lastSequence = value.sequence_number
    return value as unknown as ResponseStreamEvent
  }

  try {
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
  } finally {
    try {
      await reader.cancel()
    } finally {
      reader.releaseLock()
    }
  }
}
