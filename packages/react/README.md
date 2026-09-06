# @rebyte/agent-react

Headless React state for Rebyte Agent interfaces.

```sh
pnpm add https://github.com/ReByteAI/rebyte-agent-toolkit/releases/latest/download/rebyte-agent-react.tgz
```

Use `useRebyteChat` with `createFetchTransport`. The browser calls an endpoint
owned by your application; the server executes the Agent with the official
OpenAI SDK and forwards the SSE body.

Set `fileUrl` to enable the headless upload method. The browser streams bytes to
that same-origin application endpoint, receives a `file_id`, and sends it as a
focused OpenAI Responses file or image input.

This package owns chat state, uploads, interruption, and event reduction. It
does not contain a Rebyte Responses client.

See the [repository README](../../README.md#headless-react) for usage.

## Stream state

Each assistant chat message has a `response` state:

| Field | Meaning |
|---|---|
| `responseId` | Server Response ID, available from `response.created`. |
| `textMessages` | Text items with stable `id`, `outputIndex`, text, status, and optional phase represented as `null` when absent. |
| `outputText` | Text concatenated without separators, matching the OpenAI SDK. |
| `toolCalls` | Managed MCP and client function calls, with their output indexes. |
| `events` | Received Responses events for an optional inspector. |
| `response` | Terminal server Response, or `null` while streaming. |

`message.content` separates text items with blank lines for presentation. The
optional UI renders texts and tools in output-index order. Completed items
must agree with their deltas; malformed streams surface an error.

Client functions have `execution: 'client'`, their `callId`, and status
`awaiting_output` once arguments are complete. This is not a completed tool
execution. The hook does not execute application functions or submit their
outputs automatically. Use `onResponse` to hand completed calls to your host
application and the official SDK to return outputs. See
[Client tools](https://rebyte.ai/docs/skills-tools/client-tools).

## Disconnects and errors

`send()` rejects on stream errors or a connection that ends without a terminal
Response, and calls `onError`. The existing Response ID and partial output
remain available. The hook does not automatically retry, resume SSE, or poll
for the final result. Your server may retrieve that Response to reconcile the
UI. This includes `response_stream_restarted` after an upstream model retry.

`stop()` invokes the transport's interruption endpoint before closing the
browser stream. Closing or resetting a browser stream alone does not cancel
the server Run. Stream readers are released on completion and early exit.
