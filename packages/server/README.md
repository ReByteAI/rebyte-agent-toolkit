# @rebyte/agent-server

A shared Hono application proxy for the Node and Cloudflare App Kit examples.

```ts
import { createAgentApp } from '@rebyte/agent-server'
const app = createAgentApp({ apiKey: process.env.REBYTE_API_KEY!,
  agentId: process.env.REBYTE_AGENT_ID!, baseURL: 'https://api.rebyte.ai/v1' })
```

`/api/sessions` creates hosted Sessions for the configured saved Agent. Routes
proxy retrieval, deletion, live events, input submission, Items, Turns, Artifact
list/download and inline file upload. The upload limit is 5 MiB. Event submission
requires `Idempotency-Key`. API errors retain their HTTP status.

This is an example boundary, not an authentication framework. Mount behind login
and authorize every Session against the current user in your application. The
included Agent-ID check only prevents use of a different Agent. Keys stay on the
server. [Architecture](../../docs/architecture.md).
