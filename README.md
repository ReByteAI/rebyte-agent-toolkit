# Rebyte Agent SDK

Build managed Rebyte Agents into a server or React application.

Rebyte owns the Agent execution loop, durable Conversations, tool calls, and
streaming protocol. This repository provides the client layers; it does not
force an application UI.

- [Agent API documentation](https://rebyte.ai/docs/agent-api/overview)
- [Quickstart](https://rebyte.ai/docs/agent-api/quickstart)
- [Create an API key](https://app.rebyte.ai/settings/api-keys)

## Status

Packages are distributed as public, token-free `.tgz` assets on
[GitHub Releases](https://github.com/ReByteAI/rebyte-agent-sdk/releases).
They are not published to an npm registry.

```sh
pnpm add https://github.com/ReByteAI/rebyte-agent-sdk/releases/latest/download/rebyte-agent-sdk.tgz
```

The stable asset name always resolves to the latest Release. Use a versioned
Release URL only when the application must pin an exact SDK version.

## Packages

Install only the layer your product needs:

| Package | Owns | Does not own |
|---|---|---|
| `@rebyte/agent-sdk` | Responses client, durable Conversations, SSE events, response accumulation | React, UI, application auth |
| `@rebyte/agent-react` | Headless chat state and browser/server transports | Markup and styles |
| `@rebyte/agent-ui` | Optional App Kit-style chat and execution inspector | API keys and backend policy |
| `@rebyte/cli` | `agent.toml` validation, create, apply, and export | Agent execution |

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
console.log(response.conversation.id)
```

`model` is the Rebyte Agent ID. Use the Conversation helper for multiple turns:

```ts
const conversation = client.conversation({
  model: process.env.REBYTE_AGENT_ID!,
})

await conversation.send('Remember that the deployment color is blue.')
await conversation.send('What is the deployment color?')

console.log(conversation.id)
```

One stable Conversation ID owns every turn. The helper does not build a
client-side `previous_response_id` chain.

## Headless React

Install Core and React together from the same Release:

```sh
pnpm add \
  https://github.com/ReByteAI/rebyte-agent-sdk/releases/latest/download/rebyte-agent-sdk.tgz \
  https://github.com/ReByteAI/rebyte-agent-sdk/releases/latest/download/rebyte-agent-react.tgz
```

The browser talks to an endpoint in your application. That endpoint
authenticates the user and forwards Rebyte's SSE stream while keeping the
organization API key on the server.

```tsx
import { useMemo } from 'react'
import { createFetchTransport, useRebyteChat } from '@rebyte/agent-react'

function Chat() {
  const transport = useMemo(
    () => createFetchTransport({
      url: '/api/responses',
      interruptUrl: '/api/conversations/interrupt',
    }),
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

Install all three runtime layers from the same Release:

```sh
pnpm add \
  https://github.com/ReByteAI/rebyte-agent-sdk/releases/latest/download/rebyte-agent-sdk.tgz \
  https://github.com/ReByteAI/rebyte-agent-sdk/releases/latest/download/rebyte-agent-react.tgz \
  https://github.com/ReByteAI/rebyte-agent-sdk/releases/latest/download/rebyte-agent-ui.tgz
```

```tsx
import { createFetchTransport } from '@rebyte/agent-react'
import { AgentChat } from '@rebyte/agent-ui'
import '@rebyte/agent-ui/styles.css'

const transport = createFetchTransport({
  url: '/api/responses',
  interruptUrl: '/api/conversations/interrupt',
})

export function App() {
  return <AgentChat transport={transport} agentName="Research Agent" inspector />
}
```

Use `AgentChatView` with the state returned by `useRebyteChat` when you need a
controlled component.

## Rebyte CLI

```sh
pnpm add --global https://github.com/ReByteAI/rebyte-agent-sdk/releases/latest/download/rebyte-cli.tgz
export REBYTE_API_KEY="rbk_..."
rebyte agent create -f agent.toml
```

The CLI manages organization-scoped API Agents and supports `dev`, `test`,
`prod`, or an exact `--base-url`.

## Run the example

Requires Node 22+ and pnpm 10.

```sh
pnpm install
pnpm build
cp examples/react-chat/.env.example examples/react-chat/.env.local
# Add REBYTE_API_KEY and REBYTE_AGENT_ID.
pnpm dev
```

Open <http://127.0.0.1:4100>. The backend on port `4101` forwards the Responses
event stream without exposing the organization key to the browser.

Verify a real two-turn stream with one stable Conversation:

```sh
pnpm test:live
```

## Protocol scope

The initial client implements Rebyte's focused OpenAI Responses subset:

- synchronous Responses and live SSE;
- stable `conversation` continuity;
- durable Response retrieval;
- standard text and MCP call events;
- additive Rebyte tool-progress events;
- Conversation create, retrieve, list, interrupt, and delete.

Agent management remains available through the REST API and Rebyte CLI.
Request-level OpenAI tools, file and image inputs, structured output, and
background mode are outside the current SDK contract.

See [docs/architecture.md](./docs/architecture.md) for package boundaries and
[examples/react-chat](./examples/react-chat/README.md) for the proxy contract.

## Development

```sh
pnpm test
pnpm typecheck
pnpm build
```

MIT
