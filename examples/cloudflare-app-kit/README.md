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
`wrangler.jsonc`. It forwards the Responses event stream without buffering it.
The composer supports files and images: it streams each selected file to
`/api/files`, the Worker creates the Rebyte upload and writes the stream to the
signed object-storage URL, and `/api/responses` references the returned
`file_id` using the focused OpenAI input array.

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
