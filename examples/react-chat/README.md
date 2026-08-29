# React chat example

This example is a thin React client plus a same-origin Hono proxy. It demonstrates the intended production boundary: the browser sends input and its stable `conversation` ID; the server supplies the organization API key and Agent public ID.

```sh
cp .env.example .env.local
# Edit .env.local.
pnpm --dir ../.. dev
```

Open <http://127.0.0.1:4100>.

The sample `agent.toml` is optional. It can be used with the Rebyte CLI to create a fresh Agent, after which its public ID goes in `.env.local` as `REBYTE_AGENT_ID`.
