# Rebyte SDK fork verification — 2026-09-15

## Local function search verification — 2026-09-16

- SDK accepts `tool_search` and deferred functions; resolved Session tool types
  retain that declaration. CLI manifest parsing supports and validates the pair.
- SDK dual build, package smoke, CLI build/smoke and all Toolkit workspace
  typechecks passed. The documented TOML example parses; removing `tool_search`
  while retaining `defer_loading=true` is rejected.
- Real local `pnpm --filter @rebyte/example-agents-api deferred-functions` passed:
  Agent creation, Session creation, model search, client order lookup, result
  submission, completed Turn and resource deletion. Test Agent
  `agent_8108417ada044b0ab79726beda3814ae`, Session
  `sess_cdc2a0d319e64c88b5f39a5c7eb0cfe1`; temporary Dev key revoked.
- These changes are local; npm and production have not been updated.

The local Toolkit now uses `@rebyteai/agent-sdk`, built from the pinned OpenAI
TypeScript API client source. See `packages/sdk/UPSTREAM.md` for provenance and
maintenance. The initial checks below preceded npm publication. No production
service was changed for this work. The separate Python Commerce integration continues using
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

## npm release — 2026-09-15

Published `0.2.0` under the organization owned by the maintainer, `@rebyteai`:

- `@rebyteai/agent-sdk`
- `@rebyteai/agent-server`
- `@rebyteai/agent-react`
- `@rebyteai/agent-ui`
- `@rebyteai/cli`

Release source: `fb15a1c3e80ded1f7518739fdc354ba743015bec`, tag `v0.2.0`.
All five registry version endpoints returned the original archive SHA-512
integrities after publication. npm trusted publishers were configured for
`ReByteAI/rebyte-agent-toolkit`, workflow `release.yml`, with direct publication
allowed. No long-lived npm token was added to GitHub.

The first consumer installation attempts received 404 for npm package metadata
while version endpoints and public/latest settings already existed. Once metadata
propagated, installation of all five packages from npm succeeded in a fresh
consumer project, with no workspace links or package overrides.

Verified against the installed npm packages:
- SDK ESM/CommonJS/subpath imports, default URL/key behavior and wire serialization.
- AppKit React/UI ESM and CommonJS imports, CSS export, server adapter health route
  constructed with API key and Agent ID only.
- Installed `pnpm exec rebyte --help`.
- Real local API chat: Agent and Session creation, completed model turn, response
  retrieval, no-environment behavior, deletion and 404 after cleanup. Test Agent
  `agent_08bc2160fedd49489a44bf554339e404`, Session
  `sess_b175839347244d818d6d6f579aefc788`; both deleted.

GitHub CI run `34911085158` passed. Release runs `34911087415` and `34911436802`
passed build/typechecks/tests but refused to replace locally published archives
whose rebuilt bytes differed. The second run preserves candidates for inspection.
The original archives were verified again against npm before creating the GitHub
Release. No npm version was overwritten or republished.

The archive difference was isolated to gzip's OS header byte: macOS wrote `19`,
Linux wrote `3`. All five decompressed tar archives were byte-identical, including
every file and its metadata. Future packing normalizes this informational byte to
`255` (unknown OS), preserving strict whole-archive integrity verification across
platforms. The already-published 0.2.0 archives remain unchanged.

Release: https://github.com/ReByteAI/rebyte-agent-toolkit/releases/tag/v0.2.0
