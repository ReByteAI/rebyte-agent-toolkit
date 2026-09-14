import { Stream } from '@rebyteai/agent-sdk/core/streaming'
import type { AgentSession, AgentSessionEvent, AgentSessionInputParam, AgentSessionItem } from '@rebyteai/agent-sdk/resources/beta/agents/agents'
import type { Turn } from '@rebyteai/agent-sdk/resources/beta/agents/sessions/turns'
import type { SessionArtifact } from '@rebyteai/agent-sdk/resources/beta/agents/sessions/artifacts'
import { AgentTransportError, createTurnState, type TurnState, type TextMessageState, type ToolCallState } from './state.js'
import type { AgentAttachment, AgentUploadProgress } from './state.js'

export type { AgentSession, AgentSessionEvent, Turn, SessionArtifact }
export interface SessionAttachment extends AgentAttachment { sessionId: string; path: string }
export interface AgentSessionTransport {
  create(): Promise<AgentSession>
  retrieve(id: string): Promise<AgentSession>
  subscribe(id: string, signal: AbortSignal): Promise<AsyncIterable<AgentSessionEvent>>
  submit(id: string, events: AgentSessionInputParam[], key: string): Promise<void>
  items(id: string): Promise<AgentSessionItem[]>
  turns(id: string): Promise<Turn[]>
  artifacts(id: string): Promise<SessionArtifact[]>
  artifactURL(sessionId: string, artifactId: string): string
  upload(id: string, file: File, progress?: (value: AgentUploadProgress) => void): Promise<SessionAttachment>
}
export function createAgentSessionTransport(options: { url: string; fetch?: typeof fetch }): AgentSessionTransport {
  const base = options.url.replace(/\/$/, '')
  const request = options.fetch ?? globalThis.fetch
  async function checked(path: string, init?: RequestInit) {
    const response = await request(`${base}${path}`, init)
    if (!response.ok) {
      const body = await response.text()
      let message = body
      try { const parsed = JSON.parse(body); if (typeof parsed?.error?.message === 'string') message = parsed.error.message } catch { /* Plain HTTP errors retain their response text. */ }
      throw new AgentTransportError(response.status, message, null, body)
    }
    return response
  }
  const path = (id: string) => `/${encodeURIComponent(id)}`
  async function list<T>(id: string, resource: string): Promise<T[]> { return (await (await checked(`${path(id)}/${resource}`)).json()).data }
  return {
    async create() { return (await checked('', { method: 'POST' })).json() },
    async retrieve(id) { return (await checked(path(id))).json() },
    async subscribe(id, signal) {
      const controller = new AbortController()
      const abort = () => controller.abort()
      signal.addEventListener('abort', abort, { once: true })
      if (signal.aborted) controller.abort()
      let response: Response
      try { response = await checked(`${path(id)}/events`, { headers: { Accept: 'text/event-stream' }, signal: controller.signal }) }
      catch (error) { signal.removeEventListener('abort', abort); throw error }
      const stream = Stream.fromSSEResponse<AgentSessionEvent>(response, controller)
      return (async function* () {
        try { for await (const event of stream) yield event }
        finally { signal.removeEventListener('abort', abort); controller.abort() }
      })()
    },
    async submit(id, events, key) {
      await checked(`${path(id)}/events`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': key }, body: JSON.stringify({ events }) })
    },
    items: id => list<AgentSessionItem>(id, 'items'),
    turns: id => list<Turn>(id, 'turns'),
    artifacts: id => list<SessionArtifact>(id, 'artifacts'),
    artifactURL: (id, artifactId) => `${base}${path(id)}/artifacts/${encodeURIComponent(artifactId)}/content`,
    async upload(id, file, progress) {
      if (file.size > 5 * 1024 * 1024) throw new Error('File exceeds the 5 MiB upload limit')
      const url = `${base}${path(id)}/files?filename=${encodeURIComponent(file.name)}`
      const uploaded = await new Promise<{ session_id: string; path: string; size_bytes: number }>((resolve, reject) => {
        const xhr = new XMLHttpRequest()
        xhr.open('POST', url)
        xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream')
        xhr.upload.onprogress = e => { if (e.lengthComputable) progress?.({ loaded: e.loaded, total: e.total, percent: Math.min(99, Math.round(e.loaded / e.total * 100)) }) }
        xhr.onload = () => {
          try {
            const body = JSON.parse(xhr.responseText)
            if (xhr.status < 200 || xhr.status >= 300) throw new Error(body.error?.message ?? `Upload failed: ${xhr.status}`)
            resolve(body)
          } catch (error) { reject(error) }
        }
        xhr.onerror = () => reject(new Error('Upload failed'))
        xhr.onabort = () => reject(new Error('Upload cancelled'))
        xhr.send(file)
      })
      if (uploaded.session_id !== id || typeof uploaded.path !== 'string' || uploaded.size_bytes !== file.size) throw new Error('Upload returned an invalid Session file')
      progress?.({ loaded: file.size, total: file.size, percent: 100 })
      return { sessionId: id, path: uploaded.path, fileId: uploaded.path, filename: file.name, size: file.size, contentType: file.type || 'application/octet-stream', inputType: file.type.startsWith('image/') ? 'input_image' : 'input_file' }
    },
  }
}

// This is a presentation projection only; original Agents events remain in the inspector.
export function projectSessionItem(state: TurnState, item: AgentSessionItem, index: number): TurnState {
  if (item.type === 'message' && item.role === 'assistant') {
    if (item.id === null) throw new Error('Persisted assistant message has no ID')
    const value: TextMessageState = { id: item.id, outputIndex: index, status: item.status, phase: item.phase,
      text: item.content.filter(part => part.type === 'output_text').map(part => part.text).join('') }
    const messages = state.textMessages.some(message => message.id === item.id)
      ? state.textMessages.map(message => message.id === item.id ? value : message) : [...state.textMessages, value]
    return { ...state, textMessages: messages, outputText: messages.map(message => message.text).join('') }
  }
  if (item.type === 'function_call_output') return { ...state, toolCalls: state.toolCalls.map(tool => tool.callId === item.call_id ? { ...tool, status: item.status, output: typeof item.output === 'string' ? item.output : JSON.stringify(item.output), error: item.error } : tool) }
  if (item.type !== 'command_execution' && item.type !== 'mcp_call' && item.type !== 'function_call') return state
  const serverFunction = item.type === 'function_call' && ['write_stdin', 'apply_patch', 'view_image', 'list_mcp_resources', 'list_mcp_resource_templates', 'read_mcp_resource', 'rebyte_web_search'].includes(item.name)
  const value: ToolCallState = {
    id: item.id, outputIndex: index, execution: item.type === 'function_call' && !serverFunction ? 'client' : 'server',
    callId: item.type === 'function_call' ? item.call_id : null,
    name: item.type === 'command_execution' ? 'exec_command' : item.name,
    serverLabel: item.type === 'command_execution' ? 'Session Sandbox' : item.type === 'mcp_call' ? item.server_label : serverFunction ? 'Session runtime' : 'client',
    status: item.type === 'function_call' && !serverFunction && item.status === 'completed' ? 'awaiting_output' : item.status,
    arguments: item.type === 'command_execution' ? item.command : JSON.stringify(item.arguments),
    output: item.type === 'command_execution' ? item.output : item.type === 'mcp_call' && item.output != null ? JSON.stringify(item.output) : null,
    error: item.type === 'command_execution' && item.exit_code !== null && item.exit_code !== 0 ? `Exit code ${item.exit_code}` : item.type === 'mcp_call' && item.error != null ? JSON.stringify(item.error) : null,
  }
  return { ...state, toolCalls: state.toolCalls.some(tool => tool.id === item.id) ? state.toolCalls.map(tool => tool.id === item.id ? value : tool) : [...state.toolCalls, value] }
}
export function reduceSessionEvent(state: TurnState, event: AgentSessionEvent): TurnState {
  let next: TurnState = { ...state, events: [...state.events, event] }
  if (event.type === 'agent.session.turn.item.added' || event.type === 'agent.session.turn.item.done') {
    if (event.output_index !== null) next = projectSessionItem(next, event.item, event.output_index)
  } else if (event.type === 'agent.session.turn.output_text.delta') {
    if (!next.textMessages.some(message => message.id === event.item_id)) throw new Error('Text delta has no message')
    const messages = next.textMessages.map(message => message.id === event.item_id ? { ...message, text: message.text + event.delta } : message)
    next = { ...next, textMessages: messages, outputText: messages.map(message => message.text).join('') }
  } else if (event.type === 'agent.output.command_execution_output.delta') {
    next.toolCalls = next.toolCalls.map(tool => tool.id === event.item_id ? { ...tool, output: (tool.output ?? '') + event.delta } : tool)
  }
  return next
}
export function sessionItemState(items: AgentSessionItem[]): TurnState {
  return items.reduce((state, item, index) => projectSessionItem(state, item, index), createTurnState())
}
