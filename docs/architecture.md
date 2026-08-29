# Architecture

Rebyte separates Agent management from Agent execution.

```text
Control plane                           Execution

agent.toml ── Rebyte CLI ── Agent API   OpenAI SDK ── /v1/responses
                         │                         │
                         └──── managed Agent ──────┘
                               Skills + MCP
                               cloud runtime
```

The OpenAI SDK owns the Responses client. Rebyte owns the Agent definition and
the managed execution behind the compatible endpoint.

## Optional browser layers

```text
@rebyte/agent-ui       optional components and CSS
        ↓
@rebyte/agent-react    headless state + application transport
        ↓
your application server ── official OpenAI SDK ── Rebyte /v1/responses
```

`@rebyte/agent-react` does not contain a Rebyte API client. It turns the SSE
events forwarded by the application into chat state. `@rebyte/agent-ui` is a
replaceable reference interface.

## Trust boundary

An organization API key represents the organization, not an end user. It must
not ship in browser JavaScript.

```text
Browser                 Your application server               Rebyte
   │ POST input                   │                               │
   ├─────────────────────────────>│ authenticate + authorize      │
   │                              ├─ OpenAI SDK /v1/responses ───>│
   │                              │<──── ordered SSE events ──────┤
   │<──── ordered SSE events ─────┤                               │
```

`createFetchTransport` implements the browser side. The example server
implements the forwarding side with the official OpenAI SDK. Authentication
and per-user authorization remain application concerns.

## State ownership

A Conversation keeps one stable `conv_…` ID across turns. The server passes
that ID to the next Responses call. The React package holds only current UI
state; it is not a Conversation database.

## Agent definition versus execution

`agent.toml` defines the prompt, model, Skills, MCP servers, and connected
capabilities. The CLI or Agent REST API stores that definition. The returned
Agent ID is then used as `model` with the official OpenAI SDK.
