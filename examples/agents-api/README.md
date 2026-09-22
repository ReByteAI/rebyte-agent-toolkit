# Agents API recipes

These scripts use the official `openai@7.15.0` client with `REBYTE_API_KEY` and an explicit Rebyte endpoint (`REBYTE_BASE_URL`, default `https://api.rebyte.ai/v1`). Workflow recipes additionally use `@rebyteai/agent-extensions`. Build this workspace before running the source examples.

```sh
# From the repository root:
pnpm install
pnpm build
export REBYTE_API_KEY='rbk_...'
# For a running local Relay instead:
# export REBYTE_BASE_URL='http://127.0.0.1:34567/v1'
pnpm --filter @rebyte/example-agents-api chat
pnpm --filter @rebyte/example-agents-api functions
pnpm --filter @rebyte/example-agents-api deferred-functions
pnpm --filter @rebyte/example-agents-api hosted
```

The organization needs model/compute credit and key permissions `tasks:read`,
`tasks:write`, `files:read`, `files:write`. `REBYTE_MODEL` optionally selects a
model; the default is `gpt-5.6-luna`. No existing Agent or Session is assumed.

| Recipe | Checks |
| --- | --- |
| `chat` | Agent creation, Session creation with initial input, omitted environment resolves to none, completed Turn and text |
| `functions` | No Sandbox, authoritative `requires_action`, validated host arguments, function-result submission, model continuation |
| `deferred-functions` | Explicit `tool_search`, deferred order lookup, discovery followed by the same client handler, no Sandbox |
| `hosted` | Inline input file, lazy hosted Sandbox, `exec_command`, patch request, output file copied to Artifact, exact downloaded bytes |

The functions example's order lookup is deliberately local and deterministic; the
model and Rebyte runtime are real. Only `requires_action` authorizes host execution.
Do not execute every `function_call` Item: server built-ins can use that shape too.
Production handlers must check user authorization and persist side-effect/result
idempotency by `call_id`. API input idempotency does not deduplicate your database write.

These recipes use durable polling, which also works after a stream disconnect.
For live streaming, follow the [App Kit implementation](../react-chat/README.md):
subscribe before submitting input, retain Session/Turn IDs, and reconcile persisted
Items after reconnect. Session creation itself is not idempotent; investigate an
ambiguous creation failure before creating a replacement.

## Load application functions on demand

Add `{ type: 'tool_search' }` to `agent.tools` and set `defer_loading: true` on
selected function definitions. The full definition is still supplied by your
application. The runtime exposes its schema to the model after discovery;
the model then calls the function by its original name. Handle its
`required_actions` and return `agent.session.input.tool_result` just as in the
`functions` recipe. Loaded definitions remain available in that Session.

Adding `tool_search` does not defer every function: omitted/false stays eager.
True without a `tool_search` entry is rejected. Session overrides must contain
the complete tools array, including `tool_search` and each function.

CLI `agent.toml` uses the same configuration:

```toml
model = "gpt-5.6-luna"

[[tools]]
type = "tool_search"

[[tools]]
type = "function"
name = "lookup_order"
description = "Look up an order in the application."
defer_loading = true
parameters = { type = "object", properties = { order_id = { type = "string" } }, required = ["order_id"], additionalProperties = false }
```

MCP uses automatic discovery independently; neither application function search
nor service-origin MCP requires a Sandbox.

## MCP without a Sandbox

Saved Agents contain reusable definitions. The Session selects the current user's
credentials. A Session `tools` override replaces the whole array.

```js
const tools = [{ type: 'mcp', server_label: 'company',
  connection_origin: 'service', required: true,
  transport: { type: 'http', server_url: process.env.COMPANY_MCP_URL } }];
const agent = await client.beta.agents.create({ model: 'gpt-5.6-luna', tools });
const session = await client.beta.agents.sessions.create({ agent_id: agent.id,
  agent: { tools: [{ ...tools[0], transport: { ...tools[0].transport,
    authorization: `Bearer ${accessToken}` } }] },
  input: 'Use the company tools to answer my question.',
});
```

`client` is the configured official OpenAI client; `accessToken` is obtained and
authorized by your server. No environment is supplied. See
[MCP](https://rebyte.ai/docs/agents-api/tools/mcp) and
[Vaults](https://rebyte.ai/docs/agents-api/tools/vaults) for reusable credentials,
OAuth refresh, resource tools and stdio. This snippet needs your own MCP endpoint;
the three runnable checks above do not assert an external provider works.

## Skills belong to the Environment

Use an inline ZIP containing `SKILL.md` at its root:

```js
const session = await client.beta.agents.sessions.create({ agent_id: agent.id,
  environment: { type: 'openai_hosted', skills: [{ type: 'inline',
    name: 'my-skill', description: 'Explains when to use this skill.',
    source: { type: 'base64', media_type: 'application/zip',
      data: zipBytes.toString('base64') } }] },
});
```

`zipBytes` is a Node Buffer. Installation happens when the Sandbox is first
initialized, not when saving the Agent or on every Turn/resume. The model reads the
installed `SKILL.md` and follows its commands using `exec_command`; there are no
separate List Skill or Run Skill tools. The [Commerce converter](https://github.com/ReByteAI/commerce-agent-starter/blob/main/examples/retail/api/rebyte_config.py)
shows how to package checked-in Skills. Rebyte's GitHub source variant is an
[extension](https://rebyte.ai/docs/agents-api/environments/openai-hosted), outside
the upstream OpenAI skill union; use an explicitly typed HTTP request for this Rebyte extension.

## References

- [OpenAI Agents API overview](https://developers.openai.com/api/docs/guides/agents-api/overview)
- [OpenAI functions](https://developers.openai.com/api/docs/guides/agents-api/tools/functions)
- [OpenAI MCP](https://developers.openai.com/api/docs/guides/agents-api/tools/mcp)
- [Rebyte support and behavior](https://rebyte.ai/docs/agents-api/overview)

Rebyte's runtime, available models, billing and environment lifecycle are its own.
The protocol name `openai_hosted` means Rebyte-hosted compute at the Rebyte endpoint.

## Dynamic Workflow

Rebyte supports `{ type: 'dynamic_workflow' }` as an Agents API extension. The JavaScript recipe uses the official client. It lets the Session
model generate JavaScript that composes its server-side tools. The runnable
example uses service MCP, without allocating a Session VM, and deletes its
Session after streaming the answer.

Build the extension package and use a Rebyte organization API key with `tasks:read` and
`tasks:write`:

```sh
pnpm --filter @rebyteai/agent-extensions build
export REBYTE_API_KEY='rbk_...'
pnpm --filter @rebyte/example-agents-api dynamic-workflow
```

The example explicitly connects to `https://api.rebyte.ai/v1`. Each program runs
in a fresh isolate with a 300-second deadline. Client functions remain in the
ordinary Agent loop. See [the example](dynamic-workflow.mjs) and the
[Dynamic Workflow guide](https://rebyte.ai/docs/agents-api/tools/dynamic-workflow).

## Workflow Agents

These recipes use `client.workflowAgents`, currently available from **GitHub
source** and the optional `@rebyteai/agent-extensions` package. Build this checkout first. They use
the default production endpoint (or `REBYTE_BASE_URL`), need `tasks:read` and
`tasks:write`, and delete only the Agents and runs they create in `finally`.

```sh
pnpm --filter @rebyteai/agent-extensions build
export REBYTE_API_KEY='rbk_...'
pnpm --filter @rebyte/example-agents-api workflow-agent
pnpm --filter @rebyte/example-agents-api workflow-generate
pnpm --filter @rebyte/example-agents-api workflow-tools
```

| Recipe | What it exercises |
| --- | --- |
| [workflow-agent.mjs](workflow-agent.mjs) | Unsaved preview → saved draft → streamed test → publish → streamed execution; idempotent retry, event replay, version pagination, new version publication and pinned old-version execution |
| [workflow-generate.mjs](workflow-generate.mjs) | Stream code from the official Workflow Builder → preview → create → test → publish → execute with new JSON input |
| [workflow-tools.mjs](workflow-tools.mjs) | Configure DeepWiki MCP → discover a tool → call it from isolated JavaScript → stream progress/result; no Sandbox |

`workflow-agent` uses deterministic code with no model. `workflow-generate` uses
Rebyte's platform-funded authoring Agent; generated code is verified by executing
it with two inputs, and the recipe fails if results differ. In your product, show
the draft code and schema for review before execution. To revise a draft:

```js
const { draft: revised } = await client.workflowAgents.generate({
  prompt: 'Also return the currency USD',
  draft, // the previous completed WorkflowDraft
  // preview_error: 'The previous preview error, if any',
})
```

Pass the same `tools`, `environment` and `vault_ids` to generation and execution
when using them: generation returns code/schema/example input, not a copy of the
configuration. `workflow-tools` calls the public DeepWiki service and depends on
its availability. Your own MCP service can expose a custom function or a call to
another language model through the same `tools.search_tools` / `tools.call_tool`
interface. Client functions cannot run inside the isolate.

A draft version must pass `.test()` before `.publish()`; an unsaved preview is not
a publication test. Updating code creates a new version and leaves the published
default unchanged. Execution failures are run resources/events: inspect the final
status. The shared recipe helper also rejects streams that end without a terminal
event. Tool failures can be caught by the program without failing the entire run.

Keep idempotency keys stable when retrying an execution. Breaking out of the
original execution stream cancels that run; to observe without owning execution,
use `client.workflowAgents.runs.events.stream(runId, { after: sequence })`. Keep
`sequence` as a string. Delete terminal runs separately from Agents to clean up
their tool environments. See the [Extension reference](../../packages/extensions/README.md#workflow-agents)
and [Workflow Agents guide](https://rebyte.ai/docs/agents-api/workflow-agents).

## Schedules

`node examples/agents-api/schedules.mjs` verifies the extension's Schedule API
against a published fixed Workflow: paused creation, idempotent manual trigger,
run retrieval, exact result and one-run cap. It archives its test schedule and
deletes its Workflow fixtures. It does not leave an automatic timer.
