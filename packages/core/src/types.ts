export type JsonPrimitive = string | number | boolean | null
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue }

export interface ResponseInputText {
  type: 'input_text'
  text: string
}

export interface ResponseInputMessage {
  type?: 'message'
  role: 'user'
  content: string | ResponseInputText[]
}

export type ResponseInput = string | ResponseInputMessage[]

export interface ResponseOutputText {
  type: 'output_text'
  text: string
  annotations: unknown[]
  [key: string]: unknown
}

export interface ResponseOutputMessage {
  id: string
  type: 'message'
  status: 'in_progress' | 'completed' | 'failed'
  role: 'assistant'
  content: ResponseOutputText[]
  [key: string]: unknown
}

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

export type ResponseOutputItem = ResponseOutputMessage | ResponseMcpCall | {
  id: string
  type: string
  [key: string]: unknown
}

export interface ResponseError {
  code: string
  message: string
  [key: string]: unknown
}

export interface RebyteResponse {
  id: string
  object: 'response'
  created_at: number
  status: 'queued' | 'in_progress' | 'completed' | 'failed'
  background: false
  completed_at: number | null
  model: string
  output: ResponseOutputItem[]
  output_text: string
  previous_response_id: string | null
  error: ResponseError | null
  incomplete_details: null
  instructions: null
  max_output_tokens: null
  metadata: Record<string, never>
  parallel_tool_calls: true
  reasoning: null
  store: true
  temperature: null
  text: { format: { type: 'text' } }
  tool_choice: 'auto'
  tools: []
  top_p: null
  truncation: 'disabled'
  usage: null
  conversation: { id: string }
  [key: string]: unknown
}

export interface CreateResponseParams {
  model: string
  input: ResponseInput
  stream?: boolean
  conversation?: string | { id: string }
  previous_response_id?: string
  store?: true
  background?: false
}

export interface RequestOptions {
  signal?: AbortSignal
  idempotencyKey?: string
  headers?: Record<string, string>
}

export interface ResponseStreamEventBase {
  type: string
  sequence_number: number
  [key: string]: unknown
}

export interface ResponseCreatedEvent extends ResponseStreamEventBase {
  type: 'response.created' | 'response.in_progress'
  response: RebyteResponse
}

export interface ResponseOutputTextDeltaEvent extends ResponseStreamEventBase {
  type: 'response.output_text.delta'
  item_id: string
  output_index: number
  content_index: number
  delta: string
}

export interface ResponseOutputTextDoneEvent extends ResponseStreamEventBase {
  type: 'response.output_text.done'
  item_id: string
  output_index: number
  content_index: number
  text: string
  logprobs: unknown[]
}

export interface ResponseContentPartEvent extends ResponseStreamEventBase {
  type: 'response.content_part.added' | 'response.content_part.done'
  item_id: string
  output_index: number
  content_index: number
  part: ResponseOutputText
}

export interface ResponseOutputItemEvent extends ResponseStreamEventBase {
  type: 'response.output_item.added' | 'response.output_item.done'
  output_index: number
  item: ResponseOutputItem
}

export interface ResponseMcpCallArgumentsDeltaEvent extends ResponseStreamEventBase {
  type: 'response.mcp_call_arguments.delta'
  item_id: string
  output_index: number
  delta: string
}

export interface ResponseMcpCallArgumentsDoneEvent extends ResponseStreamEventBase {
  type: 'response.mcp_call_arguments.done'
  item_id: string
  output_index: number
  arguments: string
}

export interface ResponseMcpLifecycleEvent extends ResponseStreamEventBase {
  type:
    | 'response.mcp_call.in_progress'
    | 'response.mcp_call.completed'
    | 'response.mcp_call.failed'
  item_id: string
  output_index: number
}

export interface ResponseRebyteToolCallEvent extends ResponseStreamEventBase {
  type:
    | 'response.rebyte_tool_call.started'
    | 'response.rebyte_tool_call.progress'
    | 'response.rebyte_tool_call.action_required'
    | 'response.rebyte_tool_call.failed'
  response_id: string
  run_id: string
  step: number | null
  source_type: string
  data: unknown
}

export interface ResponseCompletedEvent extends ResponseStreamEventBase {
  type: 'response.completed' | 'response.failed'
  response: RebyteResponse
}

export interface ResponseApiErrorEvent extends ResponseStreamEventBase {
  type: 'error'
  code: string
  message: string
  param: string | null
}

export type KnownResponseStreamEvent =
  | ResponseCreatedEvent
  | ResponseOutputTextDeltaEvent
  | ResponseOutputTextDoneEvent
  | ResponseContentPartEvent
  | ResponseOutputItemEvent
  | ResponseMcpCallArgumentsDeltaEvent
  | ResponseMcpCallArgumentsDoneEvent
  | ResponseMcpLifecycleEvent
  | ResponseRebyteToolCallEvent
  | ResponseCompletedEvent
  | ResponseApiErrorEvent

export type ResponseStreamEvent = KnownResponseStreamEvent | ResponseStreamEventBase

export interface RebyteClientOptions {
  apiKey: string
  baseURL?: string
  fetch?: typeof globalThis.fetch
  defaultHeaders?: Record<string, string>
  dangerouslyAllowBrowser?: boolean
}

export interface RebyteConversationObject {
  id: string
  object: 'conversation'
  model: string
  title: string
  status: 'idle' | 'running' | 'paused'
  created_at: string
  updated_at: string
}

export interface CreateConversationParams {
  model: string
  title?: string
}

export interface ListConversationsParams {
  model?: string
  limit?: number
  offset?: number
}

export interface ConversationList {
  data: RebyteConversationObject[]
  total: number
  limit: number
  offset: number
}

export interface ConversationInterruptResult {
  status: 'interrupting' | 'no_turn'
}

export type ConversationCreateParams = Omit<
  CreateResponseParams,
  'model' | 'input' | 'stream' | 'conversation' | 'previous_response_id'
>
