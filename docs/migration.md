# Migrate to Agents API

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
