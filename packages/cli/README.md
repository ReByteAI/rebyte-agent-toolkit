# @rebyteai/cli

Manage saved Agents through the Rebyte Agent SDK fork. Install the release in your project:

```sh
pnpm add -D @rebyteai/cli
```

No repository clone is required. The historical `ReByteAI/rebyte-cli` repository
is archived; this package is the current CLI.

```sh
export REBYTE_API_KEY='rbk_...'
pnpm exec rebyte agent validate -f /path/to/agent.toml
pnpm exec rebyte agent create -f /path/to/agent.toml
pnpm exec rebyte agent apply agent_... -f /path/to/agent.toml
pnpm exec rebyte agent export agent_... -o /path/to/export.toml
```

`--env dev` uses `http://127.0.0.1:34567`; production defaults to
`https://api.rebyte.ai`. `REBYTE_BASE_URL` or `--base-url` accepts the origin or
its `/v1` URL. `--env test` requires `REBYTE_TEST_BASE_URL`. Export refuses to
replace an existing file unless `--force` is present.

## Manifest

```toml
model = "gpt-5.6-luna"
name = "Company assistant"
instructions_file = "prompt.md"

[[tools]]
type = "mcp"
server_label = "company"
connection_origin = "service"
transport = { type = "http", server_url = "${COMPANY_MCP_URL}" }

[[tools]]
type = "function"
name = "lookup_order"
description = "Look up an order authorized for the current shopper."
parameters = { type = "object", properties = { order_id = { type = "string" } }, required = ["order_id"], additionalProperties = false }
```

`model` is required. Use either inline `instructions` or `instructions_file`
(relative to the manifest). `tools` defaults to an empty array. Optional settings
are `reasoning`, `text`, `service_tier` and `metadata`, using the
[Agents configuration fields](https://rebyte.ai/docs/agents-api/configuration).
Unknown fields and invalid schemas fail before a request is sent. Model availability
and provider-specific settings are validated by the server.

Complete `${VARIABLE}` tool values are expanded from the environment. Instructions
retain literal examples. Do not place HTTP authorization headers in saved Agents;
use Session overrides or Vaults. For stdio MCP, omit `connection_origin` and supply
an absolute `cwd`. Skills, packages, files and network policy belong to the Session.

`apply` describes the entire saved configuration: omitted optional values clear
previous settings. It does not modify existing Sessions. Export preserves native
MCP definitions, omits redacted/null optional fields and removes stdio's derived
connection origin. Literal JSON null in schemas or request metadata cannot be
represented in TOML; export fails without writing. Use the Rebyte SDK for JSON.

See [migration](../../docs/migration.md) for retired manifest fields. The Commerce
repository has its own local business manifest and Python converter; that file is
not an input for this CLI.


## Load client functions on demand

Tool Search requires CLI 0.2.1 or later. Include a `tool_search` entry, then set
`defer_loading = true` on selected function entries:

```toml
model = "gpt-5.6-luna"

[[tools]]
type = "tool_search"

[[tools]]
type = "function"
name = "lookup_order"
description = "Look up an order by its ID."
defer_loading = true
parameters = { type = "object", properties = { order_id = { type = "string" } }, required = ["order_id"], additionalProperties = false }
```

Omitted/false stays eager. Deferred functions without `tool_search` fail
validation. The CLI only manages definitions; your application handles
`required_actions` and returns `agent.session.input.tool_result`. MCP tools use
automatic search independently and need no `defer_loading` flag.

See the [function guide](https://rebyte.ai/docs/agents-api/tools/functions),
[MCP guide](https://rebyte.ai/docs/agents-api/tools/mcp) and
[runnable deferred-functions recipe](../../examples/agents-api/README.md).
