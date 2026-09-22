# Official client migration verification

Verified locally on 2026-09-22 against the development Rebyte Agents API with
`openai@7.15.0`. The source checks below preceded publication; the release
verification section records the published npm artifacts. No Rebyte backend
deployment was made.

## Dependency and package checks

- Removed the entire `packages/sdk` client fork (450 tracked files).
- Standard Agent calls, AppKit server and CLI use the official `openai` package.
- React imports official event types and the exported SSE parser.
- Workflow and Schedule resources live in `@rebyteai/agent-extensions`, composed
  with an existing official client; no subclassing or mutation of that client.
- Workspace typecheck, existing protocol/CLI checks and all package/template
  builds passed. The documentation website built and prerendered 51 routes.
- Packed the extension and server packages, installed them with `openai` into a
  fresh temporary project, and checked imports. Extension imports worked in ESM
  and CommonJS, an extension request used the supplied transport, and the official
  client was not modified.

## Live API checks

These called the development service and executed real work:

- Ordinary chat returned the requested exact marker.
- A deferred host function executed and returned its result through the official
  client's Session API.
- The fixed Workflow recipe covered preview, test, publication, execution,
  streaming, event replay, idempotency, version pagination and a pinned older
  published version.
- The Schedule recipe targeted a published Workflow version, manually triggered
  an initially paused schedule, verified idempotency and the result, retrieved
  its run and checked the one-run cap. The schedule was archived afterward.
- AppKit's live check passed two turns, 32 events, file upload, artifact download,
  cross-Session artifact rejection (404) and independent Session isolation.

The recipes cleaned up their test Agents, Sessions and Workflow runs. Schedule
history is retained by the API's archive semantics; no recurring timer was left.

## Browser check

The Node AppKit template ran on local ports 5100/5101. Through the isolated
headless browser, a first turn returned `OFFICIAL_SDK_APPKIT_20260922` and a second
turn recalled that marker in the same Session. Both turns completed. Reload
restored both messages, the composer returned to idle, and New conversation
reset the interface. The test Session was deleted afterward.

The Node template was exercised end to end; the Cloudflare template was built
and typechecked, but was not deployed to a Worker during this verification.

## Reproduce

```sh
pnpm install --frozen-lockfile
pnpm typecheck
pnpm test
pnpm build
# With the AppKit server running and a development organization key configured:
APP_KIT_URL=http://127.0.0.1:5101 pnpm --filter @rebyte/example-react-chat test:live
# REBYTE_API_KEY and REBYTE_BASE_URL must identify the intended environment:
node examples/agents-api/workflow-agent.mjs
node examples/agents-api/schedules.mjs
```

See the [recipe guide](../examples/agents-api/README.md) for chat/function commands
and [release procedure](releases.md) for package bootstrap and publication.

## npm release verification

Published all five packages at `0.3.0` on 2026-09-22: `agent-extensions`,
`agent-server`, `agent-react`, `agent-ui`, and `cli` under the `@rebyteai` scope.
The release source is commit `06a31fb83de72b915b14c6d529e9c9a2ae9a0b5d`, tagged
[`v0.3.0`](https://github.com/ReByteAI/rebyte-agent-toolkit/releases/tag/v0.3.0).
The [release workflow](https://github.com/ReByteAI/rebyte-agent-toolkit/actions/runs/35680904713)
passed; its archives matched the local reviewed candidates byte for byte.

Installed all five exact versions from the public npm registry into a fresh
directory. Verified each published SHA-512 integrity against its candidate,
ESM/CommonJS exports where supported, the official client's extension composition,
and CLI version `0.3.0`. The installation contains `openai@7.15.0` and no
`@rebyteai/agent-sdk` fork.

The extension's first version was bootstrapped with npm account authentication;
the existing four packages used GitHub OIDC. Configuring the new extension's
trusted publisher still requires completing npm's separate account verification
before its next release. The attempted verification expired; it did not change
that setting. See [release setup](releases.md#subsequent-releases-through-github-actions).
