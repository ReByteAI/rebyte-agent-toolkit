# @rebyteai/agent-server

Install the versioned package (no repository clone required):

```sh
pnpm add @rebyteai/agent-server@0.2.0
```


A shared Hono application proxy for the Node and Cloudflare App Kit examples.

```ts
import { createAgentApp } from '@rebyteai/agent-server'
const app = createAgentApp({ apiKey: process.env.REBYTE_API_KEY!,
  agentId: process.env.REBYTE_AGENT_ID! })
```

`/api/sessions` creates hosted Sessions for the configured saved Agent. Routes
proxy retrieval, deletion, live events, input submission, Items, Turns, Artifact
list/download and inline file upload. The upload limit is 5 MiB. Event submission
requires `Idempotency-Key`. API errors retain their HTTP status.

This is an example boundary, not an authentication framework. Mount behind login
and authorize every Session against the current user in your application. The
included Agent-ID check only prevents use of a different Agent. Keys stay on the
server. [Architecture](../../docs/architecture.md).
