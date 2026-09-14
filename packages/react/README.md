# @rebyteai/agent-react

Install the versioned package (no repository clone required):

```sh
pnpm add @rebyteai/agent-react@0.2.0
```


Headless React state for native Agents API Sessions. The browser calls your
same-origin application server, never the organization API directly.

```tsx
import { createAgentSessionTransport, useAgentSession } from '@rebyteai/agent-react'
const transport = createAgentSessionTransport({ url: '/api/sessions' })
// Inside a React component:
const chat = useAgentSession({ transport, initialSessionId, onSession })
```

Persist `chat.sessionId` via `onSession`, then pass it as `initialSessionId` on
reload. `send(text)` subscribes before posting input and resolves with a Turn.
`stop()` submits cancellation; the running send consumes the terminal event.
`reset()` starts a new conversation without deleting the old Session.
`upload(file)` creates the Session if needed and writes a file into its environment
(5 MiB maximum in this example). `artifacts` supplies immutable download URLs.

Each assistant message has a `turnId` and a presentation-only `projection`:
`textMessages`, `toolCalls`, `outputText`, and the received native `events`.
Built-in server functions are distinct from client functions. A completed client
result updates its matching call; the actual handoff is Session `requires_action`.

History is restored from persisted Items and Turns. A recovered active Session is
polled until settled. Live disconnects report an error; reload recovers output
without resending input. The hook reports client-tool waiting as an error and does
not run application handlers or submit their outputs. For those workflows, use
the [Rebyte SDK recipe](../../examples/agents-api/README.md) or Commerce adapter.

Images are uploaded as Session files. The model can use hosted `view_image` to
inspect them; the upload itself is not an inline model image message. No browser
transport includes an organization API key.
