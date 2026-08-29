import { useCallback, useReducer, useRef } from 'react'
import {
  createResponseState,
  reduceResponseState,
  type RebyteResponse,
  type ResponseState,
  type ResponseStreamEvent,
} from '@rebyte/agent-sdk'
import type { AgentTransport } from './transport.js'

export interface AgentChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  status: 'completed' | 'streaming' | 'failed' | 'cancelled'
  responseId: string | null
  response: ResponseState | null
}

export interface UseRebyteChatOptions {
  transport: AgentTransport
  initialPreviousResponseId?: string
  initialMessages?: AgentChatMessage[]
  onEvent?: (event: ResponseStreamEvent) => void
  onResponse?: (response: RebyteResponse) => void
  onError?: (error: Error) => void
}

export interface RebyteChat {
  messages: AgentChatMessage[]
  status: 'idle' | 'streaming' | 'error'
  error: Error | null
  previousResponseId: string | null
  send: (input: string) => Promise<RebyteResponse | null>
  stop: () => void
  reset: (options?: { previousResponseId?: string; messages?: AgentChatMessage[] }) => void
}

interface State {
  messages: AgentChatMessage[]
  status: RebyteChat['status']
  error: Error | null
  previousResponseId: string | null
}

type Action =
  | { type: 'start'; userId: string; assistantId: string; input: string }
  | { type: 'event'; assistantId: string; event: ResponseStreamEvent }
  | { type: 'error'; assistantId: string; error: Error }
  | { type: 'cancel'; assistantId: string }
  | { type: 'reset'; messages: AgentChatMessage[]; previousResponseId: string | null }

function eventResponse(event: ResponseStreamEvent): RebyteResponse | null {
  return typeof event.response === 'object' && event.response !== null
    ? event.response as RebyteResponse
    : null
}

function reducer(state: State, action: Action): State {
  if (action.type === 'start') {
    return {
      ...state,
      status: 'streaming',
      error: null,
      messages: [
        ...state.messages,
        {
          id: action.userId,
          role: 'user',
          content: action.input,
          status: 'completed',
          responseId: null,
          response: null,
        },
        {
          id: action.assistantId,
          role: 'assistant',
          content: '',
          status: 'streaming',
          responseId: null,
          response: createResponseState(),
        },
      ],
    }
  }
  if (action.type === 'event') {
    const terminal = action.event.type === 'response.completed'
    const failed = action.event.type === 'response.failed' || action.event.type === 'error'
    const response = eventResponse(action.event)
    return {
      ...state,
      status: terminal ? 'idle' : failed ? 'error' : state.status,
      previousResponseId: terminal && response ? response.id : state.previousResponseId,
      error: failed
        ? new Error(response?.error?.message ?? (
          typeof action.event.message === 'string' ? action.event.message : 'Response failed'
        ))
        : state.error,
      messages: state.messages.map((message) => {
        if (message.id !== action.assistantId || !message.response) return message
        const nextResponse = reduceResponseState(message.response, action.event)
        return {
          ...message,
          content: nextResponse.outputText,
          status: terminal ? 'completed' : failed ? 'failed' : 'streaming',
          responseId: nextResponse.responseId,
          response: nextResponse,
        }
      }),
    }
  }
  if (action.type === 'error') {
    return {
      ...state,
      status: 'error',
      error: action.error,
      messages: state.messages.map((message) =>
        message.id === action.assistantId
          ? { ...message, status: 'failed', content: message.content || action.error.message }
          : message,
      ),
    }
  }
  if (action.type === 'cancel') {
    return {
      ...state,
      status: 'idle',
      messages: state.messages.map((message) =>
        message.id === action.assistantId
          ? { ...message, status: 'cancelled' }
          : message,
      ),
    }
  }
  return {
    messages: action.messages,
    status: 'idle',
    error: null,
    previousResponseId: action.previousResponseId,
  }
}

function asError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error))
}

export function useRebyteChat(options: UseRebyteChatOptions): RebyteChat {
  const { transport, onEvent, onResponse, onError } = options
  const [state, dispatch] = useReducer(reducer, {
    messages: options.initialMessages ?? [],
    status: 'idle',
    error: null,
    previousResponseId: options.initialPreviousResponseId ?? null,
  })
  const stateRef = useRef(state)
  stateRef.current = state
  const abortRef = useRef<AbortController | null>(null)
  const assistantIdRef = useRef<string | null>(null)

  const send = useCallback(async (input: string): Promise<RebyteResponse | null> => {
    const text = input.trim()
    if (!text) throw new Error('input is required')
    if (abortRef.current) throw new Error('A response is already streaming')

    const userId = crypto.randomUUID()
    const assistantId = crypto.randomUUID()
    const abort = new AbortController()
    abortRef.current = abort
    assistantIdRef.current = assistantId
    dispatch({ type: 'start', userId, assistantId, input: text })

    let terminal: RebyteResponse | null = null
    try {
      const stream = await transport.stream({
        input: text,
        previousResponseId: stateRef.current.previousResponseId,
        signal: abort.signal,
      })
      for await (const event of stream) {
        onEvent?.(event)
        dispatch({ type: 'event', assistantId, event })
        if (event.type === 'response.completed') {
          terminal = eventResponse(event)
          if (!terminal) throw new Error('response.completed did not include a Response object')
          onResponse?.(terminal)
        } else if (event.type === 'response.failed') {
          terminal = eventResponse(event)
          if (!terminal) throw new Error('response.failed did not include a Response object')
          throw new Error(terminal.error?.message ?? 'Response failed')
        } else if (event.type === 'error') {
          throw new Error(typeof event.message === 'string' ? event.message : 'Responses stream failed')
        }
      }
      if (!terminal) throw new Error('Responses stream ended without a terminal event')
      return terminal
    } catch (error) {
      if (abort.signal.aborted) {
        dispatch({ type: 'cancel', assistantId })
        return null
      }
      const normalized = asError(error)
      dispatch({ type: 'error', assistantId, error: normalized })
      onError?.(normalized)
      throw normalized
    } finally {
      if (abortRef.current === abort) abortRef.current = null
      if (assistantIdRef.current === assistantId) assistantIdRef.current = null
    }
  }, [onError, onEvent, onResponse, transport])

  const stop = useCallback(() => {
    abortRef.current?.abort()
  }, [])

  const reset = useCallback((resetOptions: {
    previousResponseId?: string
    messages?: AgentChatMessage[]
  } = {}) => {
    abortRef.current?.abort()
    dispatch({
      type: 'reset',
      messages: resetOptions.messages ?? [],
      previousResponseId: resetOptions.previousResponseId ?? null,
    })
  }, [])

  return {
    messages: state.messages,
    status: state.status,
    error: state.error,
    previousResponseId: state.previousResponseId,
    send,
    stop,
    reset,
  }
}
