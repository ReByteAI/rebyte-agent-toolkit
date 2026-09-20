# Rebyte Agent SDK

Rebyte's maintained source fork of the OpenAI Agents API TypeScript client.
Node.js 22+. Apache-2.0. Upstream provenance: [UPSTREAM.md](UPSTREAM.md).

Install in your application; no repository clone is required:

```sh
pnpm add @rebyteai/agent-sdk
export REBYTE_API_KEY='rbk_...'
```

```ts
import Rebyte, { rebyteSandbox } from '@rebyteai/agent-sdk'

const client = new Rebyte() // reads REBYTE_API_KEY; connects to Rebyte
const agent = await client.beta.agents.create({
  name: 'My agent', model: 'gpt-5.6-luna', instructions: 'Help the user.',
})
const session = await client.beta.agents.sessions.create({
  agent_id: agent.id,
  environment: rebyteSandbox(),
})
```

You can pass `{ apiKey: 'your_rebyte_key' }` explicitly. No base URL is required.
For local development only, use `REBYTE_BASE_URL=http://127.0.0.1:34567/v1`.
OpenAI environment variables do not configure this client. Keep API keys on the
server; AppKit's server adapter connects your frontend without exposing them.

`rebyteSandbox({ skills: [{ type: 'github', url: 'https://github.com/owner/repo',
name: 'my-skill' }] })` configures a session-isolated Rebyte Sandbox. It is created
only when needed; Skills install at first creation. Omit `environment` for no
Sandbox. The helper emits the compatible `openai_hosted` wire value, so existing
API clients, persisted Sessions and streaming events remain compatible.

Methods, resource import paths, pagination, SSE, errors, uploads, retries and
request options follow the upstream API client. Replace `openai` imports with
`@rebyteai/agent-sdk`. This is not `@openai/agents`, the local Agent Loop framework.
Rebyte's server capability limits still apply; see the
[API docs](https://rebyte.ai/docs/agents-api/overview).

Install released versions from npm. Matching archives and SHA-256 checksums are
available in [GitHub Releases](https://github.com/ReByteAI/rebyte-agent-toolkit/releases/latest).
To modify the SDK itself, clone this repository and run `pnpm install && pnpm build`.


For client functions, include `{ type: 'tool_search' }` and set
`defer_loading: true` on selected definitions. Discovery stays within a Session;
your application still executes the resulting client function calls. MCP
connections use automatic discovery independently. Follow the
[Tool Search guide](https://rebyte.ai/docs/agents-api/tools/functions#load-functions-on-demand)
and [runnable recipes](https://github.com/ReByteAI/rebyte-agent-toolkit/tree/main/examples/agents-api).


## Dynamic Workflow

SDK 0.2.3 and later accepts `{ type: 'dynamic_workflow' }` in saved-Agent
and Session tools. The Agent receives `run_code`, which executes generated
JavaScript against the Session's configured server tools. Each execution has a
fresh isolate and a shared 300-second deadline. Client functions stay outside
the program. This is a Rebyte extension, distinct from the upstream
`programmatic_tool_calling` configuration.

Use the [runnable example](../../examples/agents-api/dynamic-workflow.mjs) with a
Rebyte API key. See the [Dynamic Workflow guide](https://rebyte.ai/docs/agents-api/tools/dynamic-workflow).

## Workflow Agents (GitHub source)

`client.workflowAgents` is available in this checkout. It is **not included in the
published 0.2.3 npm package**; build this repository to use the examples until the
next package release. No release or version bump is made by this change.

A Workflow Agent runs saved JavaScript directly with JSON input. There is no outer
model selecting steps. Use `generate()` when you want Rebyte's shared Workflow
Builder to author a draft; authoring and execution are separate operations.

```ts
const agent = await client.workflowAgents.create({
  name: 'Order total',
  code: 'async input => ({ total: input.quantity * input.price })',
  input_schema: {
    type: 'object',
    properties: { quantity: { type: 'number' }, price: { type: 'number' } },
    required: ['quantity', 'price'], additionalProperties: false,
  },
})
const tested = await client.workflowAgents.test(agent.id, {
  version: 1, input: { quantity: 3, price: 7 },
  'Idempotency-Key': crypto.randomUUID(),
})
if (tested.status !== 'completed') throw new Error(tested.error ?? tested.status)
await client.workflowAgents.publish(agent.id, { version: 1, test_run_id: tested.id })

const events = await client.workflowAgents.runs.create(agent.id, {
  input: { quantity: 4, price: 7 }, stream: true,
  'Idempotency-Key': crypto.randomUUID(),
})
let completed = false
for await (const event of events) {
  if (event.type === 'workflow.run.output') console.log(event.value)
  if (event.type === 'workflow.run.failed' || event.type === 'workflow.run.cancelled') {
    throw new Error(event.run.error ?? event.run.status)
  }
  if (event.type === 'workflow.run.completed') {
    completed = true
    console.log(event.run.result) // { total: 28 }
  }
}
if (!completed) throw new Error('Execution stream ended before completion')
```

This snippet keeps the Agent and run records. The
[complete recipes](../../examples/agents-api/README.md#workflow-agents) clean up
the resources they create. All methods use the organization API key; read/write
operations require `tasks:read` / `tasks:write`. No beta header is needed.

| SDK method | Purpose |
| --- | --- |
| `workflowAgents.create`, `.retrieve`, `.list`, `.delete` | Manage independent Workflow Agents |
| `.generate({ prompt, ... })` | Generate a draft; optionally supply `draft` and `preview_error` to revise it |
| `.preview({ code, input_schema, input, ... })` | Execute unsaved code |
| `.versions.create(agentId, definition)` | Append a full definition or `{ base_version, code, input_schema }` |
| `.versions.retrieve(agentId, version)`, `.versions.list(agentId)` | Read immutable versions; list newest first |
| `.test(agentId, { version, input })` | Test an explicit version with real tools |
| `.publish(agentId, { version, test_run_id })` | Publish after a successful test of the same Agent/version |
| `.runs.create(agentId, { input, version? })` | Run the published default or an explicitly published version |
| `.runs.retrieve`, `.runs.list`, `.runs.cancel`, `.runs.delete` | Read, list across the organization, cancel and clean up runs |
| `.runs.events.stream(runId, { after? })` | Replay and follow persisted events |

`generate`, `preview`, `test` and `runs.create` accept `stream: true` and return
an async iterable. Literal `true`/`false` selects the corresponding TypeScript
return type. All list methods auto-paginate with `for await`; version lists use
numeric `before`, while Agent/run lists use `after` IDs. Event replay takes a
**string** sequence to preserve 64-bit precision.

A tool-failure event is data: the program may catch the failure and succeed.
Inspect the terminal run status, including for non-streaming HTTP 201 responses.
API failures, including SSE `event: error`, throw SDK errors. A stream can end on
cancellation without a terminal event; do not infer success from the iterator
ending. Disconnecting the original execution request cancels its run; ending an
event-only subscription does not. Use `.runs.cancel(runId)` for explicit cancellation.

Create, version creation, generation, preview, test, execution and publication
default to zero automatic retries, even if the client has a higher default.
Pass a per-request `{ maxRetries: ... }` to opt in deliberately. For preview,
test and execution, retain the same `'Idempotency-Key'` across retries of one
logical request; changing the input requires a new key. Create, version creation
and generation have no idempotency-key guarantee.

Returned versions/runs redact private configuration. Use `base_version` when
editing code to preserve it, or submit a complete new definition. Configured tools
are saved MCP connections or web search; `rebyteSandbox()` adds environment tools.
Client functions and nested Dynamic Workflow tools are not supported. Custom
functions or model calls can be exposed over MCP. Each execution gets a fresh
isolate and a 300-second execution deadline. There is no durable JavaScript replay.

Public types are exported at the package root and
`@rebyteai/agent-sdk/resources/workflow-agents/index`, including `WorkflowAgent`,
`WorkflowVersion`, `WorkflowRun`, `WorkflowDefinition`, `WorkflowDraft`,
`WorkflowRunEvent` and `WorkflowGenerationEvent`.
See [the API guide](https://rebyte.ai/docs/agents-api/workflow-agents).
