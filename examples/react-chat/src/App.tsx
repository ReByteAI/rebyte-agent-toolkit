import { useMemo } from 'react'
import { createFetchTransport } from '@rebyte/agent-react'
import { AgentChat } from '@rebyte/agent-ui'

export function App() {
  const transport = useMemo(() => createFetchTransport({
    url: '/api/responses',
    interruptUrl: '/api/conversations/interrupt',
  }), [])

  return (
    <AgentChat
      transport={transport}
      brand="Rebyte"
      agentName="SDK Test Agent"
      welcomeTitle="One agent. Any interface."
      welcomeDescription="The server uses the official OpenAI SDK. This UI is optional."
    />
  )
}
