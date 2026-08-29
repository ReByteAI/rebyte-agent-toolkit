# @rebyte/cli

Create and manage organization-scoped Rebyte Agents from `agent.toml`.

## Install from GitHub Releases

```sh
pnpm add --global https://github.com/ReByteAI/rebyte-agent-sdk/releases/download/v0.1.0/rebyte-cli-0.1.0.tgz
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

See the [`agent.toml` reference](https://rebyte.ai/docs/agent-api/agents#portable-agenttoml).
