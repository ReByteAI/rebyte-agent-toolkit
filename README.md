# Rebyte Agent Toolkit

Build with **Rebyte Agent SDK**, our maintained source fork of the OpenAI
Agents API TypeScript client. Use `client.beta.agents` with `REBYTE_API_KEY`;
the SDK connects to Rebyte by default. Rebyte hosts the Agent Loop, models,
Session Sandboxes and Artifacts. AppKit adds a configuration CLI, React hooks,
chat UI, and Node and Cloudflare server integration.

```ts
import Rebyte, { rebyteSandbox } from '@rebyteai/agent-sdk'
const client = new Rebyte()
const agent = await client.beta.agents.create({
  name: 'My assistant', model: 'gpt-5.6-luna', instructions: 'Answer clearly.',
})
const session = await client.beta.agents.sessions.create({
  agent_id: agent.id, environment: rebyteSandbox(),
})
```

See [the SDK package](packages/sdk/README.md) and
[upstream provenance](packages/sdk/UPSTREAM.md). Compatibility refers to the
OpenAI Agents **API client**, not the separate `@openai/agents` Agent Loop library.

Start with the [Rebyte guide](https://rebyte.ai/docs/agents-api/quickstart) and
[OpenAI Agents API reference](https://developers.openai.com/api/docs/guides/agents-api/overview).
Use Rebyte's guide for supported features and Rebyte-specific behavior.

## Install a release

Use Node.js 22+. You do not need to clone this repository to use the SDK.
Install the current release package in your application:

```sh
pnpm add @rebyteai/agent-sdk
export REBYTE_API_KEY='rbk_...'
```

For AppKit, install the components your application uses:

```sh
pnpm add @rebyteai/agent-react @rebyteai/agent-ui @rebyteai/agent-server
```

Dependencies between Rebyte packages are pinned to the same release and installed
automatically. React/React DOM are supplied by your application. Server-only
applications need only the API SDK; UI components are optional.

For the CLI:

```sh
pnpm add -D @rebyteai/cli
pnpm exec rebyte --help
```

Packages are published on npm. [GitHub Releases](https://github.com/ReByteAI/rebyte-agent-toolkit/releases/latest)
provide release notes and matching archives with SHA-256 checksums.

## Run or modify the examples

Clone the repository only when you want the complete example applications or to
contribute source changes.

Node.js 22+, pnpm 10:

```sh
pnpm install
pnpm build
```

| Example | What you learn |
| --- | --- |
| [Rebyte SDK recipes](examples/agents-api/README.md) | Create an Agent and Session; no-Sandbox chat; eager/deferred client functions; files and Artifacts; cleanup |
| [Workflow Agents](examples/agents-api/README.md#workflow-agents) | Generate or write fixed JavaScript, preview, test, publish, stream runs, use MCP and manage versions (GitHub source; not yet in npm 0.2.3) |
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
import { createAgentSessionTransport, useAgentSession } from '@rebyteai/agent-react'
import { AgentChatView } from '@rebyteai/agent-ui'
import '@rebyteai/agent-ui/styles.css'

// Create once outside the component so subscriptions survive renders.
const transport = createAgentSessionTransport({ url: '/api/sessions' })
export function Chat() {
  const chat = useAgentSession({ transport })
  return <AgentChatView chat={chat} />
}
```

`@rebyteai/agent-server` supplies the shared Hono example proxy. The browser never
receives the organization key. Authenticate users and enforce ownership of every
Session on your server before public deployment: the example's fixed Agent check
is not per-user authorization. See [architecture](docs/architecture.md).

The React hook handles server tools and displays native events. It does not
implement application-specific client functions; use the Rebyte SDK recipe or
Commerce adapter for that host loop. [Package API](packages/react/README.md).

## Validate changes

```sh
pnpm test             # SDK public exports/defaults and CLI protocol smoke checks
pnpm typecheck
pnpm build
APP_KIT_URL=http://127.0.0.1:4101 pnpm --filter @rebyte/example-react-chat test:live
```

Live tests use real models and compute, so the selected organization needs credit.
[Recipes](examples/agents-api/README.md) create their own Agents and Sessions and
delete them after checking results. App Kit's live test checks the configured
saved Agent through the actual application proxy and deletes only its test Sessions.

Release **v0.2.0** uses Agents API exclusively. Releases before v0.2.0 predate
this API migration.
The removed Responses hooks and old manifests require [migration](docs/migration.md).
