# Rebyte API extensions

Rebyte-only Workflow and Schedule resources for an existing official `openai`
client. Standard Agents APIs remain on `client.beta.agents`. This package has no
copy of the OpenAI client and does not modify it.

```sh
pnpm add openai@7.15.0 @rebyteai/agent-extensions@0.3.0
```

```ts
import OpenAI from 'openai'
import { RebyteExtensions } from '@rebyteai/agent-extensions'

const client = new OpenAI({
  apiKey: process.env.REBYTE_API_KEY,
  baseURL: 'https://api.rebyte.ai/v1',
  maxRetries: 0,
})
const rebyte = new RebyteExtensions(client)
```

The peer dependency pins the verified `openai@7.15.0` transport. Requests share the
same credentials, URL, custom fetch, timeout and errors as the official client.
The resource implementation imports only exported OpenAI modules. Workflow SSE
needs a dedicated parser because a caught tool failure is data, not an API error.

## Workflow Agents

A Workflow Agent runs saved JavaScript directly with JSON input. There is no outer
model selecting steps. Use `generate()` when you want Rebyte's shared Workflow
Builder to author a draft; authoring and execution are separate operations.

```ts
const agent = await rebyte.workflowAgents.create({
  name: 'Order total',
  code: 'async input => ({ total: input.quantity * input.price })',
  input_schema: {
    type: 'object',
    properties: { quantity: { type: 'number' }, price: { type: 'number' } },
    required: ['quantity', 'price'], additionalProperties: false,
  },
})
const tested = await rebyte.workflowAgents.test(agent.id, {
  version: 1, input: { quantity: 3, price: 7 },
  'Idempotency-Key': crypto.randomUUID(),
})
if (tested.status !== 'completed') throw new Error(tested.error ?? tested.status)
await rebyte.workflowAgents.publish(agent.id, { version: 1, test_run_id: tested.id })

const events = await rebyte.workflowAgents.runs.create(agent.id, {
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
are saved MCP connections or web search; `{ type: 'openai_hosted' }` adds environment tools.
Client functions and nested Dynamic Workflow tools are not supported. Custom
functions or model calls can be exposed over MCP. Each execution gets a fresh
isolate and a 300-second execution deadline. There is no durable JavaScript replay.

Public types are exported from `@rebyteai/agent-extensions`, including `WorkflowAgent`,
`WorkflowVersion`, `WorkflowRun`, `WorkflowDefinition`, `WorkflowDraft`,
`WorkflowRunEvent` and `WorkflowGenerationEvent`.
See [the API guide](https://rebyte.ai/docs/agents-api/workflow-agents).


### Schedules

`rebyte.schedules` manages independent API schedules targeting an ordinary Agent
or an explicit published Workflow version. Ordinary Agent targets require
`session_mode: 'continuous' | 'isolated'`. Each trigger has its own run record;
continuous schedules retain one Session across Turns.

```ts
const schedule = await rebyte.schedules.create({
  name: 'Daily review',
  target: { type: 'agent', agent_id: 'agent_...', session_mode: 'continuous', input: 'Review progress since the last run.' },
  timing: { type: 'cron', expression: '0 9 * * *', timezone: 'Asia/Shanghai' },
  paused: true,
});
const trigger = await rebyte.schedules.trigger(schedule.id, { 'Idempotency-Key': 'review-1' });
console.log(trigger.run_id); // Accepted asynchronously; poll runs until terminal.
for await (const run of rebyte.schedules.runs.list(schedule.id)) console.log(run.status, run.result);
```

Use `retrieve`, `update`, `pause`, `resume`, `resetSession`, and `delete` for the
schedule, and `runs.retrieve`, `runs.list`, `runs.cancel` for executions. Targets
are immutable. Reset preserves the old Session and files. Deletion preserves run
history. Mutating calls that could create work do not automatically retry by
default; reuse `Idempotency-Key` when retrying a manual trigger.

Schedules allow at most **100 total admitted runs** (default `max_runs: 100`) and
recurring clock times at least **5 minutes apart**. Manual and failed runs consume
the cap; skipped triggers do not. Resetting a Session never resets the run count.
See [Schedules](https://rebyte.ai/docs/agents-api/schedules) for timing and lifetime semantics.
