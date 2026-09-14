import { useCallback, useMemo } from 'react'
import { createAgentSessionTransport, useAgentSession } from '@rebyte/agent-react'
import { AgentChatView } from '@rebyte/agent-ui'

export function App() {
  const transport = useMemo(() => createAgentSessionTransport({ url: '/api/sessions' }), [])
  const initialSessionId = useMemo(() => new URL(window.location.href).searchParams.get('session'), [])
  const onSession = useCallback((id: string | null) => {
    const url = new URL(window.location.href)
    if (id) url.searchParams.set('session', id)
    else url.searchParams.delete('session')
    window.history.replaceState(null, '', url)
  }, [])
  const chat = useAgentSession({ transport, onSession, ...(initialSessionId ? { initialSessionId } : {}) })
  return <AgentChatView chat={chat} brand="Rebyte" agentName="App Kit Agent" apiLabel="Agents API" continuityLabel="session"
    welcomeTitle="One agent. Independent sessions."
    welcomeDescription="Each conversation has its own files and workspace. Your work stays with its session." />
}
