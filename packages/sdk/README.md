# Rebyte Agent SDK

Rebyte's maintained source fork of the OpenAI Agents API TypeScript client.
Node.js 22+. Apache-2.0. Upstream provenance: [UPSTREAM.md](UPSTREAM.md).

Install in your application; no repository clone is required:

```sh
pnpm add @rebyteai/agent-sdk
export REBYTE_API_KEY='rbk_...'
```

```ts
import Rebyte, { rebyteSandbox } from '@rebyteai/agent-sdk'

const client = new Rebyte() // reads REBYTE_API_KEY; connects to Rebyte
const agent = await client.beta.agents.create({
  name: 'My agent', model: 'gpt-5.6-luna', instructions: 'Help the user.',
})
const session = await client.beta.agents.sessions.create({
  agent_id: agent.id,
  environment: rebyteSandbox(),
})
```

You can pass `{ apiKey: 'your_rebyte_key' }` explicitly. No base URL is required.
For local development only, use `REBYTE_BASE_URL=http://127.0.0.1:34567/v1`.
OpenAI environment variables do not configure this client. Keep API keys on the
server; AppKit's server adapter connects your frontend without exposing them.

`rebyteSandbox({ skills: [{ type: 'github', url: 'https://github.com/owner/repo',
name: 'my-skill' }] })` configures a session-isolated Rebyte Sandbox. It is created
only when needed; Skills install at first creation. Omit `environment` for no
Sandbox. The helper emits the compatible `openai_hosted` wire value, so existing
API clients, persisted Sessions and streaming events remain compatible.

Methods, resource import paths, pagination, SSE, errors, uploads, retries and
request options follow the upstream API client. Replace `openai` imports with
`@rebyteai/agent-sdk`. This is not `@openai/agents`, the local Agent Loop framework.
Rebyte's server capability limits still apply; see the
[API docs](https://rebyte.ai/docs/agents-api/overview).

Install released versions from npm. Matching archives and SHA-256 checksums are
available in [GitHub Releases](https://github.com/ReByteAI/rebyte-agent-toolkit/releases/latest).
To modify the SDK itself, clone this repository and run `pnpm install && pnpm build`.


For client functions, include `{ type: 'tool_search' }` and set
`defer_loading: true` on selected definitions. Discovery stays within a Session;
your application still executes the resulting client function calls. MCP
connections use automatic discovery independently. Follow the
[Tool Search guide](https://rebyte.ai/docs/agents-api/tools/functions#load-functions-on-demand)
and [runnable recipes](https://github.com/ReByteAI/rebyte-agent-toolkit/tree/main/examples/agents-api).


## Dynamic Workflow

SDK 0.2.3 and later accepts `{ type: 'dynamic_workflow' }` in saved-Agent
and Session tools. The Agent receives `run_code`, which executes generated
JavaScript against the Session's configured server tools. Each execution has a
fresh isolate and a shared 300-second deadline. Client functions stay outside
the program. This is a Rebyte extension, distinct from the upstream
`programmatic_tool_calling` configuration.

Use the [runnable example](../../examples/agents-api/dynamic-workflow.mjs) with a
Rebyte API key. See the [Dynamic Workflow guide](https://rebyte.ai/docs/agents-api/tools/dynamic-workflow).
