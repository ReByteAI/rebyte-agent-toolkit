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

See the [repository README](../../README.md#optional-ui) for usage.
