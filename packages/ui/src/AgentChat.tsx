import { useEffect, useMemo, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import {
  useRebyteChat,
  type AgentAttachment,
  type AgentChatMessage,
  type AgentTransport,
  type RebyteChat,
} from '@rebyte/agent-react'

export interface AgentChatProps {
  transport: AgentTransport
  brand?: string
  agentName?: string
  apiLabel?: string
  welcomeTitle?: string
  welcomeDescription?: string
  inspector?: boolean
  className?: string
  initialConversationId?: string
}

export interface AgentChatViewProps extends Omit<AgentChatProps, 'transport' | 'initialConversationId'> {
  chat: RebyteChat
}

const SendIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 19V5M5 12l7-7 7 7" />
  </svg>
)

const StopIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="7" y="7" width="10" height="10" rx="1" /></svg>
)

const AttachIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="m20.5 11.5-8.8 8.8a6 6 0 0 1-8.5-8.5l9.4-9.4a4 4 0 0 1 5.7 5.7l-9.4 9.4a2 2 0 0 1-2.8-2.8l8.7-8.7" />
  </svg>
)

const FileIcon = ({ image }: { image: boolean }) => image ? (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="8.5" cy="9" r="1.5" /><path d="m21 15-5-5L5 20" />
  </svg>
) : (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M6 2h8l4 4v16H6z" /><path d="M14 2v5h5" />
  </svg>
)

interface ComposerFile {
  localId: string
  file: File
  progress: number
  attachment: AgentAttachment | null
  error: string | null
}

function formatBytes(size: number): string {
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`
  return `${(size / (1024 * 1024)).toFixed(1)} MB`
}

function assistantMessages(messages: AgentChatMessage[]): AgentChatMessage[] {
  return messages.filter((message) => message.role === 'assistant')
}

export function AgentChat({ transport, initialConversationId, ...props }: AgentChatProps) {
  const chat = useRebyteChat({
    transport,
    ...(initialConversationId ? { initialConversationId } : {}),
  })
  return <AgentChatView chat={chat} {...props} />
}

export function AgentChatView({
  chat,
  brand = 'Rebyte Agent',
  agentName = 'Configured Agent',
  apiLabel = 'Responses API',
  welcomeTitle = 'Talk to your Agent.',
  welcomeDescription = 'Messages, tool execution, and streamed output share one event timeline.',
  inspector = true,
  className = '',
}: AgentChatViewProps) {
  const [theme, setTheme] = useState<'light' | 'dark'>('light')
  const [mobilePane, setMobilePane] = useState<'chat' | 'inspector'>('chat')
  const [input, setInput] = useState('')
  const [composerFiles, setComposerFiles] = useState<ComposerFile[]>([])
  const [fileError, setFileError] = useState<string | null>(null)
  const textarea = useRef<HTMLTextAreaElement>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const end = useRef<HTMLDivElement>(null)
  const running = chat.status === 'streaming'
  const uploading = composerFiles.some((file) => !file.attachment && !file.error)
  const failedUpload = composerFiles.some((file) => file.error)
  const readyAttachments = composerFiles.flatMap((file) => file.attachment ? [file.attachment] : [])
  const assistant = useMemo(() => assistantMessages(chat.messages), [chat.messages])
  const lastText = assistant[assistant.length - 1]?.content

  useEffect(() => {
    end.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chat.messages.length, lastText])

  const submit = () => {
    const text = input.trim()
    if ((!text && readyAttachments.length === 0) || running || uploading || failedUpload) return
    setInput('')
    setComposerFiles([])
    setFileError(null)
    if (textarea.current) textarea.current.style.height = 'auto'
    void chat.send({ text, attachments: readyAttachments }).catch(() => undefined)
  }

  const updateComposerFile = (localId: string, update: Partial<ComposerFile>) => {
    setComposerFiles((current) => current.map((file) =>
      file.localId === localId ? { ...file, ...update } : file,
    ))
  }

  const selectFiles = (selected: FileList | null) => {
    if (!selected || selected.length === 0 || !chat.upload) return
    const incoming = Array.from(selected)
    if (composerFiles.length + incoming.length > 8) {
      setFileError('Attach up to 8 files per message.')
      return
    }
    setFileError(null)
    const pending = incoming.map((file): ComposerFile => ({
      localId: crypto.randomUUID(),
      file,
      progress: 0,
      attachment: null,
      error: null,
    }))
    setComposerFiles((current) => [...current, ...pending])
    for (const item of pending) {
      void chat.upload(item.file, (progress) => {
        updateComposerFile(item.localId, { progress: progress.percent })
      }).then((attachment) => {
        updateComposerFile(item.localId, { attachment, progress: 100 })
      }).catch((error: unknown) => {
        const message = error instanceof Error ? error.message : String(error)
        updateComposerFile(item.localId, { error: message })
      })
    }
  }

  const newConversation = () => {
    setInput('')
    setComposerFiles([])
    setFileError(null)
    chat.reset()
  }

  return (
    <div className={`rb-agent-chat ${inspector ? '' : 'rb-no-inspector'} ${className}`.trim()} data-theme={theme}>
      <header className="rb-mobile-bar">
        <span className="rb-mobile-brand">{brand}</span>
        {inspector && (
          <div className="rb-pane-switch" aria-label="Visible pane">
            <button className={mobilePane === 'chat' ? 'is-active' : ''} onClick={() => setMobilePane('chat')}>Chat</button>
            <button className={mobilePane === 'inspector' ? 'is-active' : ''} onClick={() => setMobilePane('inspector')}>Run</button>
          </div>
        )}
      </header>

      <aside className="rb-sidebar">
        <div className="rb-brand-row">
          <span className="rb-brand">{brand}</span>
          <span className="rb-product-tag">UI</span>
        </div>
        <button className="rb-new" onClick={newConversation}>
          <span aria-hidden="true">＋</span> New conversation
        </button>
        <div className="rb-sidebar-label">Runtime</div>
        <div className="rb-runtime-card">
          <span className={`rb-runtime-dot ${running ? 'is-running' : ''}`} />
          <span>
            <strong>{agentName}</strong>
            <small>{running ? 'Agent is running' : apiLabel}</small>
          </span>
        </div>
        <div className="rb-sidebar-spacer" />
        <div className="rb-sidebar-foot">
          <span>{chat.conversationId ? `…${chat.conversationId.slice(-10)}` : 'New conversation'}</span>
          <button onClick={() => setTheme((current) => current === 'light' ? 'dark' : 'light')} aria-label="Toggle color theme">
            {theme === 'light' ? '◐' : '◑'}
          </button>
        </div>
      </aside>

      <main className={`rb-chat-pane ${mobilePane === 'chat' ? 'is-mobile-visible' : ''}`}>
        <div className="rb-messages">
          {chat.messages.length === 0 ? (
            <div className="rb-welcome">
              <span className="rb-eyebrow">{apiLabel.toUpperCase()} × REBYTE AGENTS</span>
              <h1>{welcomeTitle}</h1>
              <p>{welcomeDescription}</p>
              <div className="rb-event-sequence" aria-label="Streaming event sequence">
                <span>input</span><i />
                <span>tool calls</span><i />
                <span>text delta</span><i />
                <span>completed</span>
              </div>
            </div>
          ) : chat.messages.map((message) => (
            <Message key={message.id} message={message} />
          ))}
          {running && <div className="rb-running"><i /> Agent is running</div>}
          <div ref={end} />
        </div>
        <div className="rb-composer-wrap">
          {(chat.error || fileError) && (
            <div className="rb-error" role="alert">{fileError ? fileError : chat.error?.message}</div>
          )}
          <div className="rb-composer">
            {chat.upload && (
              <>
                <input
                  ref={fileInput}
                  className="rb-file-input"
                  type="file"
                  multiple
                  tabIndex={-1}
                  onChange={(event) => {
                    selectFiles(event.currentTarget.files)
                    event.currentTarget.value = ''
                  }}
                />
                <button
                  className="rb-attach"
                  type="button"
                  disabled={running}
                  onClick={() => fileInput.current?.click()}
                  aria-label="Attach files"
                  title="Attach files"
                >
                  <AttachIcon />
                </button>
              </>
            )}
            <div className="rb-composer-main">
              {composerFiles.length > 0 && (
                <div className="rb-composer-files" aria-label="Attached files" aria-live="polite">
                  {composerFiles.map((item) => (
                    <div className={`rb-composer-file ${item.error ? 'is-failed' : item.attachment ? 'is-ready' : 'is-uploading'}`} key={item.localId}>
                      <span className="rb-file-icon"><FileIcon image={item.file.type.startsWith('image/')} /></span>
                      <span className="rb-file-copy">
                        <strong>{item.file.name}</strong>
                        <small>
                          {item.error
                            ? item.error
                            : item.attachment
                              ? `${formatBytes(item.file.size)} · Ready`
                              : `${formatBytes(item.file.size)} · Uploading ${item.progress}%`}
                        </small>
                        {!item.attachment && !item.error && <progress max="100" value={item.progress} />}
                      </span>
                      {(item.attachment || item.error) && (
                        <button
                          type="button"
                          onClick={() => setComposerFiles((current) => current.filter((file) => file.localId !== item.localId))}
                          aria-label={`Remove ${item.file.name}`}
                        >
                          ×
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
              <textarea
                ref={textarea}
                rows={1}
                value={input}
                placeholder={composerFiles.length > 0 ? 'Add a message…' : `Message ${agentName}…`}
                disabled={running}
                onChange={(event) => {
                  setInput(event.target.value)
                  const target = event.currentTarget
                  target.style.height = 'auto'
                  target.style.height = `${Math.min(target.scrollHeight, 180)}px`
                }}
                onKeyDown={(event) => {
                  if (event.nativeEvent.isComposing || event.keyCode === 229) return
                  if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault()
                    submit()
                  }
                }}
              />
            </div>
            <button
              className={running ? 'rb-stop' : 'rb-send'}
              onClick={running ? () => void chat.stop().catch(() => undefined) : submit}
              disabled={!running && (
                uploading
                || failedUpload
                || (!input.trim() && readyAttachments.length === 0)
              )}
              aria-label={running ? 'Stop response' : 'Send message'}
            >
              {running ? <StopIcon /> : <SendIcon />}
            </button>
          </div>
          <small>{apiLabel} · Enter to send · Shift+Enter for a new line</small>
        </div>
      </main>

      {inspector && (
        <aside className={`rb-inspector-pane ${mobilePane === 'inspector' ? 'is-mobile-visible' : ''}`}>
          <Inspector messages={assistant} apiLabel={apiLabel} agentName={agentName} />
        </aside>
      )}
    </div>
  )
}

function Message({ message }: { message: AgentChatMessage }) {
  if (message.role === 'user') {
    const attachments = message.attachments ?? []
    return (
      <div className="rb-user-turn">
        {attachments.length > 0 && (
          <div className="rb-message-files">
            {attachments.map((attachment) => (
              <span key={attachment.fileId}>
                <FileIcon image={attachment.inputType === 'input_image'} />
                <span><strong>{attachment.filename}</strong><small>{formatBytes(attachment.size)}</small></span>
              </span>
            ))}
          </div>
        )}
        {message.content && <div className="rb-message rb-user-message">{message.content}</div>}
      </div>
    )
  }
  const tools = message.response?.toolCalls ?? []
  return (
    <div className={`rb-assistant-turn is-${message.status}`}>
      {tools.length > 0 && (
        <div className="rb-tools">
          {tools.map((tool) => (
            <div className={`rb-tool is-${tool.status}`} key={tool.id}>
              <span className="rb-tool-mark">{tool.status === 'completed' ? '✓' : tool.status === 'failed' ? '!' : '·'}</span>
              <span><strong>{tool.name}</strong><small>{tool.serverLabel} · {tool.status}</small></span>
            </div>
          ))}
        </div>
      )}
      {message.content && (
        <div className="rb-message rb-assistant-message">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.content}</ReactMarkdown>
        </div>
      )}
      {message.status === 'cancelled' && <div className="rb-cancelled">Response stopped</div>}
    </div>
  )
}

function Inspector({ messages, apiLabel, agentName }: {
  messages: AgentChatMessage[]
  apiLabel: string
  agentName: string
}) {
  return (
    <div className="rb-inspector">
      <div className="rb-inspector-head">
        <div><span>Execution</span><strong>{apiLabel}</strong></div>
        <span className="rb-live"><i /> LIVE</span>
      </div>
      <dl className="rb-runtime-grid">
        <div><dt>Agent</dt><dd>{agentName}</dd></div>
        <div><dt>Continuity</dt><dd>conversation</dd></div>
        <div><dt>Transport</dt><dd>Server-sent events</dd></div>
      </dl>
      {messages.length === 0 ? (
        <div className="rb-inspector-empty">
          <span>{'{ }'}</span>
          <p>Send a message to inspect the raw Responses event stream.</p>
        </div>
      ) : (
        <div className="rb-turns">
          {messages.map((message, index) => (
            <section className="rb-turn" key={message.id}>
              <header>
                <span>turn {index + 1}</span>
                <strong className={`is-${message.status}`}>{message.status}</strong>
                <small>{message.response?.events.length ?? 0} events</small>
              </header>
              <div className="rb-event-list">
                {(message.response?.events ?? []).map((event) => (
                  <details key={`${event.sequence_number}-${event.type}`}>
                    <summary><span>#{event.sequence_number}</span><strong>{event.type}</strong></summary>
                    <pre>{JSON.stringify(event, null, 2)}</pre>
                  </details>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  )
}
