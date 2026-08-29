# Rebyte Agent SDK

Build on Rebyte Agents without adopting a prebuilt application.

This repository separates the protocol client, React state, and UI into three packages. Install only the layer your product needs:

| Package | Owns | Does not own |
| --- | --- | --- |
| `@rebyte/agent-sdk` | Responses client, SSE events, response accumulator, conversation continuity | React, UI, app auth |
| `@rebyte/agent-react` | Headless chat hook and browser/server transports | Markup and styles |
| `@rebyte/agent-ui` | Optional App Kit-style React chat and execution inspector | API keys and backend policy |

The runnable example combines all three without putting the organization API key in the browser.

## Core SDK

```ts
import { Rebyte } from '@rebyte/agent-sdk'

const client = new Rebyte({
  apiKey: process.env.REBYTE_API_KEY!,
})

const stream = await client.responses.create({
  model: process.env.REBYTE_AGENT_ID!,
  input: 'Inspect this repository and summarize it.',
  stream: true,
})

for await (const event of stream) {
  if (event.type === 'response.output_text.delta') {
    process.stdout.write(event.delta)
  }
}

const response = await stream.finalResponse()
console.log(response.id)
```

`model` is the Agent public ID. For a multi-turn interaction, either pass `previous_response_id` yourself or use the small conversation helper:

```ts
const conversation = client.conversation({
  model: process.env.REBYTE_AGENT_ID!,
})

await conversation.send('Remember that the deployment color is blue.')
await conversation.send('What is the deployment color?')
```

## Headless React

The browser talks to an endpoint in your application. That endpoint authenticates your user and forwards Rebyte's SSE response; it keeps the organization key server-side.

```tsx
import { useMemo } from 'react'
import { createFetchTransport, useRebyteChat } from '@rebyte/agent-react'

function Chat() {
  const transport = useMemo(
    () => createFetchTransport({ url: '/api/responses' }),
    [],
  )
  const chat = useRebyteChat({ transport })

  return (
    <form onSubmit={(event) => {
      event.preventDefault()
      void chat.send('Hello')
    }}>
      {chat.messages.map((message) => (
        <p key={message.id}>{message.content}</p>
      ))}
      <button disabled={chat.status === 'streaming'}>Send</button>
    </form>
  )
}
```

## Optional UI

```tsx
import { createFetchTransport } from '@rebyte/agent-react'
import { AgentChat } from '@rebyte/agent-ui'
import '@rebyte/agent-ui/styles.css'

const transport = createFetchTransport({ url: '/api/responses' })

export function App() {
  return <AgentChat transport={transport} agentName="Research Agent" />
}
```

For a controlled component, use `AgentChatView` with the object returned by `useRebyteChat`.

## Run the example

Requires Node 22+ and pnpm 10.

```sh
pnpm install
pnpm build
cp examples/react-chat/.env.example examples/react-chat/.env.local
# Fill in REBYTE_API_KEY and REBYTE_AGENT_ID.
pnpm dev
```

Open <http://127.0.0.1:4100>. The local backend is on port `4101` and transparently forwards the Responses event stream.

To verify a real two-turn stream, including `previous_response_id` continuity:

```sh
pnpm test:live
```

## Protocol scope

The client intentionally follows the OpenAI Responses API shape for `responses.create`, response objects, text deltas, output items, terminal events, and `previous_response_id`. Rebyte execution events are also preserved in the same ordered stream.

It is not a re-export of the OpenAI npm package: the initial release exposes the subset Rebyte currently executes, with an open event union so new event types are not discarded. Existing Rebyte APIs are unaffected.

See [the architecture note](./docs/architecture.md) for package boundaries and [the React example](./examples/react-chat/README.md) for the proxy contract.

## Development

```sh
pnpm test
pnpm typecheck
pnpm build
```

MIT
