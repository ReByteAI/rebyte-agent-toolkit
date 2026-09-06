# Architecture

Rebyte separates Agent management from Agent execution.

```text
Control plane                           Execution

agent.toml ── Rebyte CLI ── Agent API   OpenAI SDK ── /v1/responses
                         │                         │
                         └──── managed Agent ──────┘
                               Skills + MCP + client tools
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

The maintained hosted example puts this application-server boundary in a
Cloudflare Worker. Cloudflare Access authenticates the browser before the
Worker can be reached. The Worker stores `REBYTE_API_KEY` as a Cloudflare
Secret, fixes the managed Agent ID in deployment configuration, and streams the
official OpenAI SDK response without buffering it.

Files still use Rebyte's separate upload primitive. In the hosted App Kit, the
browser streams the file to the same-origin Worker; the Worker requests an
organization-scoped signed URL and streams the bytes to object storage. This
avoids exposing credentials or depending on bucket CORS. The following
Responses input references the resulting opaque `file_id`.

## State ownership

A Conversation keeps one stable `conv_…` ID across turns. The server passes
that ID to the next Responses call. The React package holds only current UI
state; it is not a Conversation database.

## Agent definition versus execution

`agent.toml` defines the prompt, model, Skills, MCP servers, client tools, and
connected capabilities. The CLI or Agent REST API stores that definition. The
returned Agent ID is then used as `model` with the official OpenAI SDK.

A remote MCP dependency can be declared as a URL in `agent.toml`. The CLI
expands a complete `${VARIABLE_NAME}` URL value and sends the declaration to
the Agent API. The control plane discovers or reuses the organization-scoped
MCP server and stores a canonical custom-server reference on the Agent. Export
therefore writes `type = "custom"` plus `server_id`, while execution always
uses the stored managed configuration rather than reading the local manifest.

MCP tools execute behind Rebyte. Client tools execute in the host application:

```text
Host application ── user input ─────────────> Response A
Host application <─ function_call ─────────── Response A
Host application ── function_call_output ───> Response B, same Conversation
```

The function-call objects use the standard Responses format. The host does not
resend tool definitions with each Response and does not need a modified OpenAI
SDK.

Alternatively, `conversations.items.create(conversationId, { items: outputs })`
stores client-tool outputs without creating another Response or invoking the
model. The next user turn receives them from Conversation history. App Kit
shows pending client calls but does not implement application-specific tools.

## Streaming projection

Web chat and Responses consume the same ordered server Run events through
separate protocol adapters. Responses emits one message per model step with
visible text, interleaved with tools in output order. React accumulates deltas
by message ID and output index; it validates completed text against the
stream. The optional UI renders that same order.

The database owns final results. A stream disconnect is not a Run cancellation.
If a model retries after partial output, the stream ends with
`response_stream_restarted` instead of concatenating text from two attempts.
The host can retrieve the Response by ID to reconcile; React reports this
error and keeps the Response ID, but does not automatically poll or resubmit.
