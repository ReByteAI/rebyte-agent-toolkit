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
