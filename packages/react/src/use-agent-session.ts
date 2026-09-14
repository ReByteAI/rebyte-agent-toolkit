import { useCallback, useEffect, useRef, useState } from 'react'
import { createTurnState } from './state.js'
import type { AgentChatInput, AgentUploadProgress } from './state.js'
import type { AgentChatMessage } from './state.js'
import { reduceSessionEvent, sessionItemState, type AgentSession, type AgentSessionTransport, type SessionAttachment, type SessionArtifact, type Turn } from './sessions.js'

export interface AgentSessionChat {
  messages: AgentChatMessage[]
  status: 'idle' | 'streaming' | 'error'
  error: Error | null
  sessionId: string | null
  artifacts: Array<SessionArtifact & { url: string }>
  send(input: string | AgentChatInput): Promise<Turn | null>
  upload(file: File, progress?: (value: AgentUploadProgress) => void): Promise<SessionAttachment>
  stop(): Promise<void>
  reset(): void
}
export function useAgentSession(options: {
  transport: AgentSessionTransport
  initialSessionId?: string
  onSession?: (id: string | null) => void
}): AgentSessionChat {
  const { transport, onSession } = options
  const [messages, setMessages] = useState<AgentChatMessage[]>([])
  const [status, setStatus] = useState<AgentSessionChat['status']>('idle')
  const [error, setError] = useState<Error | null>(null)
  const [sessionId, setSessionId] = useState<string | null>(options.initialSessionId ?? null)
  const [artifacts, setArtifacts] = useState<AgentSessionChat['artifacts']>([])
  const idRef = useRef(sessionId)
  const creating = useRef<Promise<AgentSession> | null>(null)
  const active = useRef<AbortController | null>(null)
  const cancelRequested = useRef(false)
  const submitted = useRef(false)
  const generation = useRef(0)
  const busy = useRef(false)
  const initial = useRef(options.initialSessionId)

  const fail = useCallback((cause: unknown) => {
    const failure = cause instanceof Error ? cause : new Error(String(cause))
    setError(failure); setStatus('error')
    return failure
  }, [])
  const ensure = useCallback(async () => {
    if (idRef.current) return idRef.current
    const currentGeneration = generation.current
    const pending = creating.current ?? transport.create()
    creating.current = pending
    try {
      const session = await pending
      if (generation.current !== currentGeneration) throw new Error('Conversation changed during Session creation')
      idRef.current = session.id; setSessionId(session.id); onSession?.(session.id)
      return session.id
    } finally { if (creating.current === pending) creating.current = null }
  }, [transport, onSession])
  const refresh = useCallback(async (id: string) => {
    const [items, turns, outputs] = await Promise.all([transport.items(id), transport.turns(id), transport.artifacts(id)])
    if (idRef.current !== id) return
    const restored: AgentChatMessage[] = []
    for (const turn of turns) {
      const turnItems = items.filter(item => item.turn_id === turn.id)
      for (const item of turnItems) {
        if (item.type === 'message' && item.role === 'user' && item.id !== null) restored.push({ id: item.id, role: 'user', content: item.content.filter(part => part.type === 'input_text').map(part => part.text).join('\n'), status: 'completed', turnId: null, projection: null })
      }
      const projection = sessionItemState(turnItems)
      restored.push({ id: turn.id, role: 'assistant', content: projection.textMessages.map(item => item.text).join('\n\n'), status: turn.status === 'failed' ? 'failed' : turn.status === 'cancelled' ? 'cancelled' : turn.status === 'completed' ? 'completed' : 'streaming', turnId: turn.id, projection: { ...projection, turnId: turn.id } })
    }
    // Keep the native events captured by this browser, while using persisted items as truth.
    setMessages(previous => restored.map(message => {
      const existing = previous.find(value => value.turnId !== null && value.turnId === message.turnId)
      return existing?.projection && message.projection ? { ...message, projection: { ...message.projection, events: existing.projection.events } } : message
    }))
    setArtifacts(outputs.map(artifact => ({ ...artifact, url: transport.artifactURL(id, artifact.id) })))
  }, [transport])
  useEffect(() => {
    const id = initial.current
    if (!id) return
    let cancelled = false
    busy.current = true; setStatus('streaming')
    void (async () => {
      await refresh(id)
      // Historical events are not replayed. While a recovered turn runs, reload durable items.
      while (!cancelled) {
        const session = await transport.retrieve(id)
        if (session.status !== 'in_progress') {
          if (session.status === 'failed') throw new Error(session.error ?? 'Session failed')
          if (session.status === 'requires_action') throw new Error('Session is waiting for a client tool result')
          break
        }
        await new Promise(resolve => setTimeout(resolve, 1000))
        if (!cancelled) await refresh(id)
      }
      if (!cancelled) { await refresh(id); setStatus('idle') }
    })().catch(cause => { if (!cancelled) fail(cause) }).finally(() => { if (!cancelled) busy.current = false })
    return () => { cancelled = true; active.current?.abort() }
  }, [transport, refresh, fail])

  const send = useCallback(async (value: string | AgentChatInput): Promise<Turn | null> => {
    if (busy.current) throw new Error('A turn is already running')
    const input = typeof value === 'string' ? { text: value, attachments: [] } : value
    if (!input.text.trim() && !input.attachments.length) throw new Error('Input is required')
    busy.current = true; cancelRequested.current = false; submitted.current = false; setStatus('streaming'); setError(null)
    const abort = new AbortController(); active.current = abort
    const assistantId = crypto.randomUUID()
    let projection = createTurnState()
    let id: string | null = null
    try {
      id = await ensure()
      abort.signal.throwIfAborted()
      if (cancelRequested.current) { setStatus('idle'); return null }
      const text = [input.text.trim(), ...input.attachments.map(file => {
        if (!('sessionId' in file) || file.sessionId !== id || !('path' in file) || typeof file.path !== 'string') throw new Error('Attachment belongs to another Session')
        return `Attached file: ${JSON.stringify(file.path)}. Read this file in your Session environment.`
      })].filter(Boolean).join('\n')
      setMessages(previous => [...previous, { id: crypto.randomUUID(), role: 'user', content: input.text, attachments: input.attachments, status: 'completed', turnId: null, projection: null }, { id: assistantId, role: 'assistant', content: '', status: 'streaming', turnId: null, projection: projection }])
      // The subscription is established BEFORE submission because Agents events are live-only.
      const events = await transport.subscribe(id, abort.signal)
      abort.signal.throwIfAborted()
      if (cancelRequested.current) { setStatus('idle'); return null }
      await transport.submit(id, [{ type: 'agent.session.input.message', input: [{ role: 'user', content: [{ type: 'input_text', text }] }] }], crypto.randomUUID())
      submitted.current = true
      if (cancelRequested.current) await transport.submit(id, [{ type: 'agent.session.input.cancel' }], crypto.randomUUID())
      for await (const event of events) {
        if ('session_id' in event && event.session_id !== id) throw new Error('Event belongs to another Session')
        projection = reduceSessionEvent(projection, event)
        if ('turn_id' in event && typeof event.turn_id === 'string') projection = { ...projection, turnId: event.turn_id }
        setMessages(previous => previous.map(message => message.id === assistantId ? { ...message, content: projection.textMessages.map(item => item.text).join('\n\n'), turnId: projection.turnId, projection: projection } : message))
        if (event.type === 'agent.session.turn.completed' || event.type === 'agent.session.turn.cancelled' || event.type === 'agent.session.turn.failed') {
          await refresh(id)
          if (event.type === 'agent.session.turn.failed') throw new Error(event.turn.error?.message ?? 'Turn failed')
          setStatus('idle')
          return event.turn
        }
        if (event.type === 'agent.session.failed') throw new Error(event.session.error ?? 'Session failed')
        if (event.type === 'agent.session.requires_action') throw new Error('Session is waiting for a client tool result')
        if (event.type === 'error') throw new Error(event.error.message)
      }
      throw new Error('Session event stream disconnected. Reload to recover persisted output.')
    } catch (cause) {
      if (abort.signal.aborted) { if (id) await refresh(id); setStatus('idle'); return null }
      throw fail(cause)
    } finally { abort.abort(); if (active.current === abort) active.current = null; busy.current = false }
  }, [ensure, fail, refresh, transport])
  const stop = useCallback(async () => {
    const id = idRef.current
    cancelRequested.current = true
    try {
      if (id && (submitted.current || active.current === null)) await transport.submit(id, [{ type: 'agent.session.input.cancel' }], crypto.randomUUID())
      // Keep consuming until the server acknowledges cancellation and stops the actual tool.
      // Before message admission, send() observes cancelRequested and submits no input.
    } catch (cause) { throw fail(cause) }
  }, [transport, fail])
  return {
    messages, status, error, sessionId, artifacts, send, stop,
    async upload(file, progress) { const id = await ensure(); return transport.upload(id, file, progress) },
    reset() {
      if (busy.current) throw new Error('Stop the active turn before starting a new Session')
      generation.current++; idRef.current = null; creating.current = null; setSessionId(null); setMessages([]); setArtifacts([]); setError(null); setStatus('idle'); onSession?.(null)
    },
  }
}
