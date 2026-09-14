# Rebyte Agent Toolkit

Build with the **official OpenAI SDK** against `https://api.rebyte.ai/v1`, using
`client.beta.agents`. Rebyte hosts the agent loop, models, Session Sandboxes and
Artifacts. This repository adds a configuration CLI, an optional React hook/UI,
and Node and Cloudflare App Kit examples. It is not the OpenAI Agents SDK.

Start with the [Rebyte guide](https://rebyte.ai/docs/agents-api/quickstart) and
[OpenAI Agents API reference](https://developers.openai.com/api/docs/guides/agents-api/overview).
Use Rebyte's guide for supported features and Rebyte-specific behavior.

## Run the examples

Node.js 22+, pnpm 10:

```sh
pnpm install
pnpm build
```

| Example | What you learn |
| --- | --- |
| [Official SDK recipes](examples/agents-api/README.md) | Create an Agent and Session; no-Sandbox chat; client functions; files and Artifacts; cleanup |
| [Node App Kit](examples/react-chat/README.md) | Streaming React chat, upload, downloads, cancellation, reload and Session isolation |
| [Cloudflare App Kit](examples/cloudflare-app-kit/README.md) | The same server adapter and UI on a Worker |
| [Commerce](https://github.com/ReByteAI/commerce-agent-starter/tree/main/rebyte) | Python host executes catalog/cart/presentation functions and installs per-Session Skills |

## Configuration and execution

Create a saved Agent once, then reuse its `agent_...` ID for new Sessions.
`model` is a model ID, never an Agent ID. A Session snapshots its Agent settings;
updating the saved Agent affects future Sessions. API Agents are managed under
Platform and have no product UI Agent Profile or Workspace binding.

```toml
# agent.toml
name = "My assistant"
model = "gpt-5.6-luna"
instructions = "Answer clearly."
tools = []
```

```sh
export REBYTE_API_KEY='rbk_...'
node packages/cli/dist/cli.js agent validate -f agent.toml
# Alternatively, run the built CLI from the directory containing your manifest:
node /path/to/rebyte-agent-toolkit/packages/cli/dist/cli.js agent create -f agent.toml
```

See the [CLI reference](packages/cli/README.md) for create, apply and export.
Environment configuration, files and Skills belong to Session creation.
No environment means no Sandbox and no filesystem tools. Service MCP, Web Search
and client functions can still run. An explicit hosted environment adds
`exec_command`, `write_stdin`, `apply_patch` and `view_image`; the Sandbox is
created only on the first environment operation. Files and Artifacts are isolated
per Session, even when two Sessions use the same saved Agent.

## React and server packages

```tsx
import { createAgentSessionTransport, useAgentSession } from '@rebyte/agent-react'
import { AgentChatView } from '@rebyte/agent-ui'
import '@rebyte/agent-ui/styles.css'

// Create once outside the component so subscriptions survive renders.
const transport = createAgentSessionTransport({ url: '/api/sessions' })
export function Chat() {
  const chat = useAgentSession({ transport })
  return <AgentChatView chat={chat} />
}
```

`@rebyte/agent-server` supplies the shared Hono example proxy. The browser never
receives the organization key. Authenticate users and enforce ownership of every
Session on your server before public deployment: the example's fixed Agent check
is not per-user authorization. See [architecture](docs/architecture.md).

The React hook handles server tools and displays native events. It does not
implement application-specific client functions; use the official SDK recipe or
Commerce adapter for that host loop. [Package API](packages/react/README.md).

## Validate changes

```sh
pnpm test             # CLI validation and HTTP protocol fixture
pnpm typecheck
pnpm build
APP_KIT_URL=http://127.0.0.1:4101 pnpm --filter @rebyte/example-react-chat test:live
```

Live tests use real models and compute, so the selected organization needs credit.
[Recipes](examples/agents-api/README.md) create their own Agents and Sessions and
delete them after checking results. App Kit's live test checks the configured
saved Agent through the actual application proxy and deletes only its test Sessions.

This checkout uses Agents API exclusively. Published archives may precede these
changes; build from this source until an Agents-compatible release is published.
The removed Responses hooks and old manifests require [migration](docs/migration.md).
