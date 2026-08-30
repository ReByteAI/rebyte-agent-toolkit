# Rebyte Agent Toolkit

Configure managed Rebyte Agents and add them to React applications.

Rebyte does not ship a second Responses client. Server applications execute an
Agent with the official OpenAI SDK. This repository contains only Rebyte's
management CLI and optional browser UI layers.

- [Agent API documentation](https://rebyte.ai/docs/agent-api/overview)
- [Getting started](https://rebyte.ai/docs/agent-api/quickstart)
- [Create an API key](https://app.rebyte.ai/settings/api-keys)
- [Hosted App Kit](https://rebyte-agent-app-kit.cctools.workers.dev) (`@rebyte.ai` access)

## Two interfaces

| Task | Interface |
|---|---|
| Execute an Agent | Official OpenAI SDK and Rebyte `/v1/responses` |
| Configure an Agent | Rebyte CLI, `agent.toml`, or Agent REST API |
| Add headless React chat state | `@rebyte/agent-react` |
| Add the optional chat UI | `@rebyte/agent-ui` |

## Execute with the OpenAI SDK

```sh
pnpm add openai
```

```ts
import OpenAI from 'openai'

const client = new OpenAI({
  apiKey: process.env.REBYTE_API_KEY,
  baseURL: 'https://api.rebyte.ai/v1',
})

const stream = await client.responses.create({
  model: process.env.REBYTE_AGENT_ID,
  input: 'Inspect this repository and summarize it.',
  stream: true,
})

let conversation
for await (const event of stream) {
  if (event.type === 'response.output_text.delta') {
    process.stdout.write(event.delta)
  }
  if (event.type === 'response.completed') {
    conversation = event.response.conversation?.id
  }
}
```

`model` is the Rebyte Agent ID. Pass the returned `conversation` on later
turns. Rebyte supports a focused OpenAI Responses subset; Agent tools, Skills,
MCP servers, and credentials come from the managed Agent configuration.

## Configure with the Rebyte CLI

The CLI is a public, token-free GitHub Release asset.

```sh
pnpm add --global https://github.com/ReByteAI/rebyte-agent-toolkit/releases/latest/download/rebyte-cli.tgz
export REBYTE_API_KEY="rbk_..."
rebyte agent create -f agent.toml
```

The CLI validates, creates, applies, and exports organization-scoped API
Agents. It does not execute Responses.

## Headless React

```sh
pnpm add https://github.com/ReByteAI/rebyte-agent-toolkit/releases/latest/download/rebyte-agent-react.tgz
```

The browser talks to an endpoint in your application. That endpoint uses the
official OpenAI SDK and keeps the organization API key on the server.

```tsx
import { useMemo } from 'react'
import { createFetchTransport, useRebyteChat } from '@rebyte/agent-react'

function Chat() {
  const transport = useMemo(
    () => createFetchTransport({
      url: '/api/responses',
      interruptUrl: '/api/conversations/interrupt',
      fileUrl: '/api/files',
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

The React package contains browser state and SSE reduction only. It is not a
second server-side Responses client.

## Optional UI

```sh
pnpm add \
  https://github.com/ReByteAI/rebyte-agent-toolkit/releases/latest/download/rebyte-agent-react.tgz \
  https://github.com/ReByteAI/rebyte-agent-toolkit/releases/latest/download/rebyte-agent-ui.tgz
```

```tsx
import { createFetchTransport } from '@rebyte/agent-react'
import { AgentChat } from '@rebyte/agent-ui'
import '@rebyte/agent-ui/styles.css'

const transport = createFetchTransport({
  url: '/api/responses',
  interruptUrl: '/api/conversations/interrupt',
  fileUrl: '/api/files',
})

export function App() {
  return <AgentChat transport={transport} agentName="Research Agent" inspector />
}
```

## Run the example

Requires Node 22+ and pnpm 10.

```sh
pnpm install
pnpm build
cp examples/react-chat/.env.example examples/react-chat/.env.local
# Add REBYTE_API_KEY and REBYTE_AGENT_ID.
pnpm dev
```

Open <http://127.0.0.1:4100>. The server on port `4101` uses the official
OpenAI SDK and forwards the SSE body without exposing the organization key.

```sh
pnpm test:live
```

See [docs/architecture.md](./docs/architecture.md) for the trust boundary.

## Hosted Cloudflare App Kit

The maintained online example uses the same optional React packages. Its
Cloudflare Worker keeps the organization key private, calls the Agent through
the official OpenAI SDK, and forwards the SSE stream to the browser.

```text
Browser UI → Cloudflare Worker → OpenAI SDK → Rebyte Agent API
```

The source, Agent configuration, deployment instructions, and file endpoint
are in [`examples/cloudflare-app-kit`](./examples/cloudflare-app-kit). The live
site is protected by Cloudflare Access for the `rebyte.ai` email domain.

The reference composer includes multiple-file selection, upload progress,
removal, file/image input mapping, and attachment display in sent messages.

## Development

```sh
pnpm test
pnpm typecheck
pnpm build
```

MIT
