# Node App Kit

A React chat app backed by `@rebyte/agent-server` and the official OpenAI SDK
7.15.0. One saved Agent serves many independent Sessions.

```sh
# From this directory, using Node.js 22+:
cp .env.example .env.local
# Set REBYTE_API_KEY. Production API URL defaults to https://api.rebyte.ai/v1.
pnpm --dir ../.. install
pnpm --dir ../.. build
pnpm exec tsx scripts/create-agent.ts
# Save the printed REBYTE_AGENT_ID in .env.local.
pnpm dev
```

Open <http://127.0.0.1:4100>. The proxy listens on 4101. The key needs
`tasks:read`, `tasks:write`, `files:read`, `files:write` and the organization needs
credit. Set `REBYTE_MODEL` for Agent creation, or use the checked-in `agent.toml`
with the [CLI](../../packages/cli/README.md). Do not create an Agent per message.

For local Rebyte, set `REBYTE_API_URL=http://127.0.0.1:34567/v1` before creating
the Agent and starting the app. The CC workspace's `cctools` command
`pnpm dev:app-kit` uses this checkout on 5100/5101 with its private local config.

## Try the complete flow

1. Ask “Create /workspace/outputs/hello.txt containing Hello from App Kit.”
2. Download the Artifact below the reply.
3. Upload a text file and ask the model to read it. Upload creates the Sandbox if
   necessary; the example limit is 5 MiB per file.
4. Ask a follow-up about the file. The same Session retains it.
5. Reload the URL. The Session ID restores persisted Items, Turns and Artifacts.
6. Start a new conversation. It gets a separate Session and filesystem.

Every Session explicitly requests a hosted environment. The first environment
operation lazily creates its Sandbox. The tools are `exec_command`, `write_stdin`,
`apply_patch` and `view_image`; use the last to inspect uploaded images. Deliverables
under `/workspace/outputs` become immutable Session Artifacts at Turn completion.
“Stop” sends cancellation. “New conversation” preserves the old Session; delete it
explicitly when finished to release its Sandbox and Artifacts.

The event inspector shows native Agents events. It distinguishes built-in server
functions from application functions. This simple app does not implement a custom
function host; use [the functions recipe](../agents-api/README.md) or Commerce.

## Verify

Against an already running app:

```sh
APP_KIT_URL=http://127.0.0.1:4101 pnpm test:live
```

This checks two newly created Sessions, SSE, upload, exact Artifact download,
follow-up file persistence, cross-Session file isolation and cross-Session Artifact
404, then deletes its test Sessions. The configured saved Agent is preserved.
Run the [official SDK recipes](../agents-api/README.md) to additionally cover Agent
creation and client-function continuation from a clean fixture.

Before serving untrusted users, add login and server-side user-to-Session ownership
checks. The example's fixed-Agent check is not a substitute for user authorization.
The organization key must never appear in browser code.
