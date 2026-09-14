# Rebyte SDK fork verification — 2026-09-15

The local Toolkit now uses `@rebyteai/agent-sdk`, built from the pinned OpenAI
TypeScript API client source. See `packages/sdk/UPSTREAM.md` for provenance and
maintenance. No SDK package has been published and no production service was
changed for this work. The separate Python Commerce integration continues using
the upstream Python API client; this fork is TypeScript.

## Verified locally

- Frozen-lockfile installation, workspace build and typechecks.
- `pnpm --filter @rebyteai/agent-sdk smoke`: public ESM/CommonJS exports, resource
  subpaths, Rebyte URL/key defaults, ignored OPENAI_* credentials/destination,
  explicit local URL, client cloning, beta headers and Sandbox serialization.
- Packed SDK installed into a fresh consumer directory: ESM/CommonJS constructor
  and streaming subpath imports work without the Toolkit workspace or `openai`.
- `pnpm --filter @rebyteai/cli smoke`: CLI manifest round-trip and request protocol.
- Real local `examples/agents-api/run.mjs` recipes: create Agent and Session,
  no-environment chat, client function result submission and continuation,
  hosted file/patch execution, exact Artifact download bytes, API cleanup.
- Real `APP_KIT_URL=http://127.0.0.1:5101 pnpm --filter
  @rebyte/example-react-chat test:live`: upload, Artifact download, cross-Session
  Artifact access returns 404, same-Session file persistence over two turns,
  another Session cannot read the marker. Test Sessions deleted afterward.
- AppKit browser: SSE response and reloaded conversation restored. Dev DB showed
  completed Turns and distinct Sandbox bindings for the two isolation Sessions.
- Docs: production build prerendered 46 routes; local desktop/mobile/light/dark
  review, no horizontal page overflow, Console removed, SDK/examples visible.

## Fixture corrections made during the run

The first AppKit persistence run stopped because the model interpreted the
synthetic `/workspace/private.txt` fixture as sensitive and refused to read it.
The fixture is now explicitly described as synthetic and uses
`/workspace/session-marker.txt`; persistence/isolation assertions remain intact.

The first hosted recipe downloaded an extra newline written by the model. The
prompt now requires a `cmp` check and correction before completion. The strict
exact-byte assertion was preserved. Both corrected scenarios passed against the
real runtime, without changing runtime or tool behavior.

## Scope

`rebyteSandbox()` uses Rebyte naming and supported configuration types. It emits
`openai_hosted` on the wire, so existing API clients, stored Sessions and SSE
payloads retain their protocol. Omitting an environment still means no Sandbox.
The fork includes Rebyte's existing GitHub Skill request type. The full upstream
resource source is retained; this does not enable unsupported OpenAI endpoints
on Rebyte. AppKit server/React packages, CLI and Node/Cloudflare examples use the
fork. No Agent Loop, product UI Agent/Workspace, Relay or database schema changed.

## Reproduce

```sh
pnpm install --frozen-lockfile
pnpm build
pnpm typecheck
pnpm --filter @rebyteai/agent-sdk smoke
pnpm --filter @rebyteai/cli smoke
export REBYTE_API_KEY='<local organization key>'
export REBYTE_BASE_URL='http://127.0.0.1:34567/v1'
pnpm --filter @rebyte/example-agents-api chat
pnpm --filter @rebyte/example-agents-api functions
pnpm --filter @rebyte/example-agents-api hosted
APP_KIT_URL=http://127.0.0.1:5101 pnpm --filter @rebyte/example-react-chat test:live
```

The organization needs model/compute credit and the documented key permissions.
Start the local Relay and AppKit before live checks. Do not rebuild packages
while exercising live streams: the development watchers restart the app server.
