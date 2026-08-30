# Cloudflare App Kit

This is the maintained online example for the Rebyte browser packages.

Hosted at <https://rebyte-agent-app-kit.cctools.workers.dev>. Cloudflare Access
allows users in the `rebyte.ai` email domain.

```text
@rebyte/agent-ui
        ↓
@rebyte/agent-react
        ↓
Cloudflare Worker ── official OpenAI SDK ── Rebyte /v1/responses
```

The Worker keeps `REBYTE_API_KEY` on the server and fixes the public Agent ID in
`wrangler.jsonc`. It forwards the Responses event stream without buffering it. `/api/files` creates
the same signed Rebyte file upload used by other API clients, and
`/api/responses` accepts the focused OpenAI input array used to reference the
returned `file_id`. File selection in the reference UI is not implemented yet.

[`agent.toml`](./agent.toml) is the source configuration for the hosted Agent.

## Local

```sh
cp .dev.vars.example .dev.vars
# Set REBYTE_API_KEY and REBYTE_AGENT_ID.
pnpm --dir ../.. build
pnpm dev
```

Open <http://127.0.0.1:4100>.

## Cloudflare

```sh
pnpm build
pnpm wrangler secret put REBYTE_API_KEY
pnpm wrangler deploy
```

Deployment inventory:

- Worker: `rebyte-agent-app-kit`
- Hostname: `rebyte-agent-app-kit.cctools.workers.dev`
- Secret: `REBYTE_API_KEY`
- Variable: `REBYTE_AGENT_ID` in `wrangler.jsonc`
- Access policy: allow the `rebyte.ai` email domain

The browser never receives the Rebyte organization key. Deploy first, verify a
real streamed Response and file input, then confirm Cloudflare Access redirects
unauthenticated requests.
