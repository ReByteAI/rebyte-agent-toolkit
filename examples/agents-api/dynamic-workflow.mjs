import Rebyte from '@rebyteai/agent-sdk';

const client = new Rebyte({
  baseURL: 'https://api.rebyte.ai/v1',
  maxRetries: 0,
});

const stream = await client.beta.agents.sessions.create({
  agent: {
    model: 'gpt-5.6-luna',
    instructions: 'Use run_code exactly once: within that program, call tools.search_tools to discover the wiki tool, then tools.call_tool to read its actual output. Return { output: actualToolResult } and summarize it. Do not call MCP tools outside the program.',
    tools: [
      { type: 'dynamic_workflow' },
      {
        type: 'mcp',
        server_label: 'docs',
        connection_origin: 'service',
        required: true,
        allowed_tools: ['read_wiki_structure'],
        transport: {
          type: 'http',
          server_url: 'https://mcp.deepwiki.com/mcp',
        },
      },
    ],
  },
  input: 'Find the documentation structure for modelcontextprotocol/python-sdk.',
  stream: true,
});

let sessionId;
try {
  for await (const event of stream) {
    if (event.type === 'agent.session.created') sessionId = event.session.id;
    if (event.type === 'agent.session.turn.output_text.delta') {
      process.stdout.write(event.delta);
    }
    if (event.type === 'agent.session.turn.failed' ||
        event.type === 'agent.session.failed') {
      throw new Error(JSON.stringify(event));
    }
  }
} finally {
  if (sessionId !== undefined) {
    await client.beta.agents.sessions.delete(sessionId);
  }
}
