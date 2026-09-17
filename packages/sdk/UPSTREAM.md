# Upstream provenance and maintenance

- Repository: https://github.com/openai/openai-node
- Tag: `v7.15.0`
- Commit: `50eb4b26fc4a70ac355aff5d822e250602faa1e5`
- License: Apache-2.0; see LICENSE and NOTICE.
- Imported: all `src/`, the upstream dual ESM/CommonJS build tooling and configs.
  Upstream tests, CI, provider examples and release automation are not imported.

This is a source fork of the API client that exposes `client.beta.agents`,
not the separate `@openai/agents` local orchestration framework.

## Rebyte changes

- Package and root exports: `@rebyteai/agent-sdk`, default/`Rebyte` client;
  the upstream `OpenAI` named export remains an alias for source migration.
- `src/version.ts`: the Rebyte package version (independent of the pinned upstream version).
- `src/client.ts`: Rebyte URL, REBYTE_* environment variables, user agent;
  reject provider/residency/workload-identity options that select other services.
  OPENAI_* variables are not used for the default client's credentials or URL.
- `src/rebyte-sandbox.ts`: named Rebyte Sandbox configuration helper. The wire
  type remains `openai_hosted`, including returned Sessions and SSE events.
- `src/resources/beta/agents/agents.ts`: typed GitHub Skill extension already
  implemented by Rebyte. Request serialization and streaming stay upstream.
  The Session `AgentTool` union also retains `tool_search`, already accepted by
  upstream input/persisted Agent types, to describe Rebyte's returned configuration.
- MCP transport unions also accept Rebyte's `connection` transport. Its opaque,
  organization-bound `connection_id` is created when an organization admin attaches
  an existing Personal or Organization connection in Platform. It contains no
  provider token. Agent retrieval/update and Session snapshots preserve it; public
  clients cannot mint references from another user's raw connection ID.
- Package build: workspace dependencies and upstream TypeScript 6.0.3; upstream dual build.

## Updating

Clone the pinned upstream tag outside this repository. Compare the next upstream
commit against this commit, then merge reviewed source/build changes into this
package. Do not overwrite the fork with generated output. Keep the small Rebyte
changes above, update this receipt, and preserve all license notices. Never copy
upstream CI/publish credentials or release jobs into this workspace.

Run `pnpm install --frozen-lockfile`, `pnpm build`, `pnpm typecheck`, the CLI smoke,
packed CJS/ESM imports, and the live Agents API recipes (chat, functions, hosted)
and App Kit flow before release. Retained upstream resources are not a promise
that Rebyte supports every OpenAI endpoint; use the documented availability list.
