# Remove the fork (0.3.0)

Replace `@rebyteai/agent-sdk` with the official `openai@7.15.0` dependency.
Configure both `apiKey` and `baseURL` explicitly; official OpenAI defaults point
to OpenAI and do not read `REBYTE_*` variables. Keep `maxRetries: 0` for operations
that must not be replayed after an ambiguous transport failure.

```ts
import OpenAI from 'openai'
const client = new OpenAI({
  apiKey: process.env.REBYTE_API_KEY,
  baseURL: process.env.REBYTE_BASE_URL ?? 'https://api.rebyte.ai/v1',
  maxRetries: 0,
})
```

Existing `client.beta.agents` calls, Session IDs and stored data remain valid.
Use `{ type: 'openai_hosted' }` for the hosted environment. Import protocol types
and streaming helpers from `openai/resources/...` and `openai/core/streaming`.
Migrate AppKit server, React and CLI packages together; their 0.3.0 versions use
the official dependency directly. There is no `@openai/agents` runtime in AppKit.

For Workflow and Schedule methods, use `const rebyte = new RebyteExtensions(client)`
from `@rebyteai/agent-extensions`, then `rebyte.workflowAgents` and `rebyte.schedules`.
The extension is optional for standard Agents API users. GitHub Skills, platform
connections and Dynamic Workflow are Rebyte fields outside the official type
unions. Send them with the official client's low-level HTTP methods and explicit
types; do not globally widen or replace upstream declarations.

Old 0.2.x npm artifacts remain immutable. The deleted source fork and its historical
verification report remain available in Git history. Install the 0.3.0 AppKit
packages together and add the extension only when using Workflow or Schedule APIs.
Maintainers can follow the [release procedure](releases.md).

## Migrate from the retired API

The retired public API and Responses API are unavailable. Create a new API Agent
and new Sessions; old Profile, Conversation and Workspace IDs cannot be converted
by changing their prefix.

| Previous usage | Current usage |
| --- | --- |
| Rebyte Agent ID in `responses.create({ model })` | Saved `agent_id` in Session creation; Agent `model` is a model ID |
| `conversation: conv_...` | Persist `sess_...`; submit Session input events |
| `useRebyteChat` / `createFetchTransport` | `useAgentSession` / `createAgentSessionTransport` |
| `message.response`, `responseId` | `message.projection`, `turnId`; original events remain Agents events |
| CLI `llm`, `prompt_file`, `capabilities` | `model`, `instructions_file`, explicit `tools` |
| CLI `client_tools` | `tools` with `type: 'function'`; omit `strict` |
| CLI `mcp_servers` | Native `type: 'mcp'`, `server_label`, `transport` |
| Agent Skills / shared Sandbox | Session `environment.skills`; independent lazy Sandbox |
| Organization file IDs / Responses attachments | Session environment inline files; Session Artifact downloads |

CLI apply replaces the saved configuration described by the manifest, including
clearing omitted optional settings. Existing Sessions keep their snapshot. Inline
MCP credentials belong to Session overrides; reusable credentials belong to Vaults.
TOML cannot encode literal JSON null inside schemas. Use the official SDK with JSON
for those definitions; export fails rather than corrupting their meaning.

Use the [runnable recipes](../examples/agents-api/README.md) to verify your new
configuration, then switch your application server and browser packages together.
