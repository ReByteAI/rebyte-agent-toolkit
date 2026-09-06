# @rebyte/agent-ui

Optional React chat UI for Rebyte Agents.

```sh
pnpm add \
  https://github.com/ReByteAI/rebyte-agent-toolkit/releases/latest/download/rebyte-agent-react.tgz \
  https://github.com/ReByteAI/rebyte-agent-toolkit/releases/latest/download/rebyte-agent-ui.tgz
```

Import `@rebyte/agent-ui/styles.css`, then render `AgentChat` with an
`AgentTransport`. Use `AgentChatView` when your application owns the headless
state. When the transport defines `upload`, the composer shows its attachment
button, upload progress, removal controls, and sent-file summaries.

Texts and tools render in Responses output order, including pre-tool
commentary and the final answer. Client functions display “Awaiting client
output”; this UI does not provide or automatically execute their application
implementations. The inspector exposes received SSE events.

See the [repository README](../../README.md#optional-ui) for usage.
