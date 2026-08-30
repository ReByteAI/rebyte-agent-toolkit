import { useMemo } from 'react'
import { createFetchTransport } from '@rebyte/agent-react'
import { AgentChat } from '@rebyte/agent-ui'

export function App() {
  const transport = useMemo(() => createFetchTransport({
    url: '/api/responses',
    interruptUrl: '/api/conversations/interrupt',
    fileUrl: '/api/files',
  }), [])

  return (
    <AgentChat
      transport={transport}
      brand="Rebyte"
      agentName="Managed Agent"
      welcomeTitle="Run an Agent on the cloud."
      welcomeDescription="This UI talks to a Cloudflare app server. The server keeps the organization key private and executes the Agent with the official OpenAI SDK."
    />
  )
}
