# Official client migration verification

Verified locally on 2026-09-22 against the development Rebyte Agents API with
`openai@7.15.0`. This records the 0.3.0 source candidate, not a published npm
release or a production deployment.

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
