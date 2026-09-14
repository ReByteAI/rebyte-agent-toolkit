# Rebyte Agent SDK recipes

These scripts use `@rebyteai/agent-sdk`, our source fork of the OpenAI Agents API client, without React packages. No base URL is needed for Rebyte. They
exercise the API end to end and clean up their own Agent and Session in `finally`.

```sh
# From the repository root:
pnpm install
pnpm build
export REBYTE_API_KEY='rbk_...'
# For a running local Relay instead:
# export REBYTE_BASE_URL='http://127.0.0.1:34567/v1'
pnpm --filter @rebyte/example-agents-api chat
pnpm --filter @rebyte/example-agents-api functions
pnpm --filter @rebyte/example-agents-api hosted
```

The organization needs model/compute credit and key permissions `tasks:read`,
`tasks:write`, `files:read`, `files:write`. `REBYTE_MODEL` optionally selects a
model; the default is `gpt-5.6-luna`. No existing Agent or Session is assumed.

| Recipe | Checks |
| --- | --- |
| `chat` | Agent creation, Session creation with initial input, omitted environment resolves to none, completed Turn and text |
| `functions` | No Sandbox, authoritative `requires_action`, validated host arguments, function-result submission, model continuation |
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

`client` is the configured Rebyte SDK client; `accessToken` is obtained and
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
the upstream OpenAI skill union; the Rebyte SDK includes this variant.

## References

- [OpenAI Agents API overview](https://developers.openai.com/api/docs/guides/agents-api/overview)
- [OpenAI functions](https://developers.openai.com/api/docs/guides/agents-api/tools/functions)
- [OpenAI MCP](https://developers.openai.com/api/docs/guides/agents-api/tools/mcp)
- [Rebyte support and behavior](https://rebyte.ai/docs/agents-api/overview)

Rebyte's runtime, available models, billing and environment lifecycle are its own.
The protocol name `openai_hosted` means Rebyte-hosted compute at the Rebyte endpoint.
