import type { AgentSessionEvent } from 'openai/resources/beta/agents/agents'
export interface AgentAttachment {
  fileId: string
  filename: string
  contentType: string
  size: number
  inputType: 'input_file' | 'input_image'
}

export interface AgentChatInput {
  text: string
  attachments: AgentAttachment[]
}

export interface AgentUploadProgress {
  loaded: number
  total: number
  percent: number
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

export interface TurnState {
  status: 'idle' | 'in_progress' | 'completed' | 'failed'
  turnId: string | null
  outputText: string
  textMessages: TextMessageState[]
  error: string | null
  toolCalls: ToolCallState[]
  events: AgentSessionEvent[]
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

export function createTurnState(): TurnState {
  return {
    status: 'idle',
    turnId: null,
    outputText: '',
    textMessages: [],
    error: null,
    toolCalls: [],
    events: [],
  }
}

export interface AgentChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  attachments?: AgentAttachment[]
  status: 'completed' | 'streaming' | 'failed' | 'cancelled'
  turnId: string | null
  projection: TurnState | null
}

