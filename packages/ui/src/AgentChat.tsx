import { useEffect, useMemo, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import {
  useRebyteChat,
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
  const textarea = useRef<HTMLTextAreaElement>(null)
  const end = useRef<HTMLDivElement>(null)
  const running = chat.status === 'streaming'
  const assistant = useMemo(() => assistantMessages(chat.messages), [chat.messages])
  const lastText = assistant[assistant.length - 1]?.content

  useEffect(() => {
    end.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chat.messages.length, lastText])

  const submit = () => {
    const text = input.trim()
    if (!text || running) return
    setInput('')
    if (textarea.current) textarea.current.style.height = 'auto'
    void chat.send(text).catch(() => undefined)
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
        <button className="rb-new" onClick={() => chat.reset()}>
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
          {chat.error && <div className="rb-error" role="alert">{chat.error.message}</div>}
          <div className="rb-composer">
            <textarea
              ref={textarea}
              rows={1}
              value={input}
              placeholder={`Message ${agentName}…`}
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
            <button
              className={running ? 'rb-stop' : 'rb-send'}
              onClick={running ? () => void chat.stop().catch(() => undefined) : submit}
              disabled={!running && !input.trim()}
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
    return <div className="rb-message rb-user-message">{message.content}</div>
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
