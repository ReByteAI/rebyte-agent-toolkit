# @rebyte/agent-ui

Optional React chat components for native Agents API Sessions.

```tsx
import { AgentChat } from '@rebyte/agent-ui'
import '@rebyte/agent-ui/styles.css'
import { createAgentSessionTransport } from '@rebyte/agent-react'
const transport = createAgentSessionTransport({ url: '/api/sessions' })
// Inside your application:
<AgentChat transport={transport} initialSessionId={savedSessionId} />
```

Use `AgentChatView` with `useAgentSession` when your application owns state and
Session-ID persistence. The UI renders text and tools in Item output order, upload
progress, Session Artifact downloads, cancellation and a native event inspector.
It does not implement application-specific function handlers.

See the [Node App Kit](../../examples/react-chat/README.md) for the complete server
and browser setup. The organization key stays on the application server.
