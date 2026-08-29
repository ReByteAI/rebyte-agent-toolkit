# @rebyte/agent-react

Headless React state for Rebyte Agent interfaces.

```sh
pnpm add https://github.com/ReByteAI/rebyte-agent-sdk/releases/latest/download/rebyte-agent-react.tgz
```

Use `useRebyteChat` with `createFetchTransport`. The browser calls an endpoint
owned by your application; the server executes the Agent with the official
OpenAI SDK and forwards the SSE body.

This package owns chat state, interruption, and event reduction. It does not
contain a Rebyte Responses client.

See the [repository README](../../README.md#headless-react) for usage.
