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

These commands manage API Agents. They do not create Workspace Agents and the
resulting Agents do not appear in the product UI. Execute them through
`/v1/responses`.

See the [`agent.toml` reference](https://rebyte.ai/docs/cli/agent-configuration).

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

The parameter schema uses the OpenAI strict subset. Its root is an object;
every object lists all properties in `required` and sets
`additionalProperties = false`. Nullable fields remain required and include
`"null"` in their type. The CLI accepts draft-07 `definitions`, `$defs`,
references, string and array bounds, and rejects unsupported keywords such as
`default`.

Set `strict = false` when the function has optional parameters. In that mode,
`required` may be omitted or contain any non-duplicated subset of the object's
properties. The same schema keywords, size limits, and
`additionalProperties = false` requirement still apply.

The Agent emits a standard Responses `function_call`. Execute it in your
server or application, then submit a `function_call_output` in the same
Conversation with the official OpenAI SDK. The CLI manages the definition; it
does not execute the function. Submit every call returned by the Response in
one continuation; each `output` must be a string, and the continuation must use
the Conversation that emitted the calls. Do not pass request-level `tools` or
`previous_response_id`.

## Agent network policy

Agents inherit the organization network policy unless `agent.toml` contains a
complete override:

```toml
[network_policy]
allow_network_egress = true
domain_allowlist = "none"
additional_allowed_domains = ["api.example.com", "*.example.org"]
allow_public_traffic = false
```

`domain_allowlist` accepts `all_domains`, `package_managers_only`, or `none`.
The table fully replaces the organization default. Remove it and run
`rebyte agent apply` to restore inheritance. The policy applies when a new
Conversation Sandbox is created; existing Conversations keep their current
boundary.
