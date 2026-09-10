# @rebyte/cli

Create and manage organization-scoped Rebyte Agents from `agent.toml`.

## Install from GitHub Releases

```sh
pnpm add --global https://github.com/ReByteAI/rebyte-agent-toolkit/releases/latest/download/rebyte-cli.tgz
```

## Authentication

```sh
export REBYTE_API_KEY="rbk_..."
```

## Commands

```sh
rebyte agent validate -f agent.toml
rebyte agent create -f agent.toml
rebyte agent apply <agent-id> -f agent.toml
rebyte agent export <agent-id> -o agent.toml
```

Select `dev`, `test`, or `prod` with `--env`, or pass an exact API endpoint
with `--base-url`. `dev` defaults to `http://localhost:3332`; `prod` defaults
to `https://api.rebyte.ai`.

These commands manage organization-scoped API Agents. Administrators can
inspect them and their Conversations in the Agent management UI; they do not
appear as personal chat Agents. Execute them through `/v1/responses`.

See the [`agent.toml` reference](https://rebyte.ai/docs/cli/agent-configuration).

## MCP servers

Declare a remote MCP server directly in `agent.toml`:

```toml
[[mcp_servers]]
type = "url"
name = "storefront"
url = "${STOREFRONT_MCP_URL}"
```

Set the environment variable before validating, creating, or applying the
Agent. Environment substitution is intentionally limited to a complete
`${VARIABLE_NAME}` value. An unset or empty variable stops the command before
an API request is sent. A literal HTTP or HTTPS URL is also accepted.

The Agent API resolves a URL declaration to an organization-scoped custom MCP
server. `rebyte agent export` writes that canonical reference so the exported
manifest can be applied again:

```toml
[[mcp_servers]]
type = "custom"
name = "storefront" # optional
server_id = "550e8400-e29b-41d4-a716-446655440000"
```

The existing `capabilities` array remains supported for Rebyte capabilities,
Composio toolkits, and `custom:<server UUID>` references. `mcp_servers` entries
are added to those capabilities.

## Client tools

Client tools are function definitions stored on the Agent and executed by the
application that calls it. Add them once to `agent.toml`; do not send their
schemas on every Response:

```toml
[[client_tools]]
type = "function"
name = "present_products"
description = "Render product cards in the host application."
strict = true

[client_tools.parameters]
type = "object"
required = ["product_ids"]
additionalProperties = false

[client_tools.parameters.properties.product_ids]
type = "array"
minItems = 1
maxItems = 20
items = { type = "string" }
```

The parameter schema uses a bounded JSON Schema subset with an object root.
With `strict = true`, every object lists all properties in `required` and sets
`additionalProperties = false`. Nullable fields remain required and include
`"null"` in their type. The CLI accepts draft-07 `definitions`, `$defs`,
references, string and array bounds, and rejects unsupported keywords such as
`default`.

Validation also compiles references and regular expressions using the same
JSON Schema engine as the Agent API. Unresolved `$ref` values fail locally.

Set `strict = false` for optional parameters or dictionaries. `properties` and
`required` may be omitted. `additionalProperties` may be omitted, a boolean,
or a supported value schema such as `{ type = "string" }`. The same schema
keywords and size limits apply, including inside dictionary value schemas.
The API still validates generated arguments against the stored schema.

The Agent emits a standard Responses `function_call`. Execute it in your
server or application, then submit a `function_call_output` in the same
Conversation with the official OpenAI SDK. The CLI manages the definition; it
does not execute the function. For immediate continuation, submit every pending
output together through `responses.create`. To end the turn without invoking
the model, append outputs with `conversations.items.create`; every pending
call must be resolved before new user input. Each `output` is a string. Do not
pass request-level `tools` or `previous_response_id`.

## Session environments and Skills

The local Agent API implementation supports an optional top-level strategy:

```toml
sandbox_strategy = "session_dedicated" # or "agent_shared"

[[skills]]
repo = "your-team/agent-skills"
path = "skills/research"
ref = "main" # optional branch, tag, or commit
```

`agent_shared` is the initial default. `session_dedicated` gives each new
Session its own environment. The mode is fixed when the Agent is created;
Sessions inherit it and cannot override it. Applying an existing Agent with a
different mode returns a conflict; reapplying the same mode is supported.
Create another Agent to use a different mode. Compute is allocated only when
a tool needs it, independently of Agent and Session creation.

Skills are declarations. `list_skills`, `load_skill`, and `read_skill_file`
work without a Sandbox. First load pins the Skill bundle for that Session;
Sandbox tools prepare that exact bundle before using it. Loading instructions
does not execute scripts or install package/OS dependencies.

These additions require the matching relay changes; they are not yet released.

## Agent network policy

VM creation copies the organization network default once, unless `agent.toml`
supplies an explicit initial policy:

```toml
[network_policy]
allow_network_egress = true
domain_allowlist = "none"
additional_allowed_domains = ["api.example.com", "*.example.org"]
allow_public_traffic = false
```

`domain_allowlist` accepts `all_domains`, `package_managers_only`, or `none`.
RVM owns the live policy after creation. With the local environment-strategy
implementation, `rebyte agent apply` changes the declaration for future Sandbox
allocations. Removing this table restores organization inheritance for future
allocations. Existing Sandboxes retain their live policy and identity. Agent
reads return the declaration; use the Sandbox network policy API to inspect or
change a running environment, including custom CIDR policies. This changes the
previous Agent API behavior that read and updated the live VM directly.
