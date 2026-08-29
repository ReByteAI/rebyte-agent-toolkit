# Architecture

The SDK is deliberately a dependency ladder, not a single application framework:

```text
@rebyte/agent-ui       optional components and CSS
        ↓
@rebyte/agent-react    headless state + transport interface
        ↓
@rebyte/agent-sdk      framework-free Responses client
        ↓
Rebyte /v1/responses
```

Applications may stop at any layer. `@rebyte/agent-sdk` works in Node and server runtimes with Web Fetch APIs; it has no React or DOM dependency. `@rebyte/agent-react` does not render anything. `@rebyte/agent-ui` is one reference interface and can be replaced wholesale.

## Trust boundary

An organization API key represents the organization, not an end user. It must not ship in browser JavaScript.

```text
Browser                 Your application server               Rebyte
   │ POST input                   │                               │
   ├─────────────────────────────>│ authenticate + authorize      │
   │                              ├─ POST /v1/responses ─────────>│
   │                              │<──── ordered SSE events ──────┤
   │<──── ordered SSE events ─────┤                               │
```

`createFetchTransport` implements the browser side of this contract. The example server implements the forwarding side. Authentication and per-user authorization remain application concerns because every product has different identity and sharing rules.

For trusted server-only code, `createRebyteTransport` can connect a `Rebyte` client directly to the headless React state.

## State ownership

The core accumulator turns protocol events into immutable response state: current text, output items, tool calls, terminal response, error, and raw events. The React package composes that primitive into chat messages and cancellation. The UI renders the resulting state.

A Conversation is the durable Rebyte Session and keeps one stable `conv_…` ID across every turn. A Response is only one turn inside that Conversation. There is no SDK-side conversation database or version system. Applications that need persistence store the Conversation ID and initialize either `client.conversation({ id })` or `useRebyteChat({ initialConversationId })`.

## Agent definition versus execution

An `agent.toml` defines the Agent. The Agent public ID returned by create/apply is then used as `model` when executing `/v1/responses`. Keeping these separate lets the same Agent run from a CLI, custom backend, headless hook, or the optional UI.
