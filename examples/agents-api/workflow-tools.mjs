import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { workflowExample } from './workflow-helpers.mjs'

const { client, consume, cleanup } = workflowExample()
try {
  // Service MCP works without a Sandbox. Your own MCP can expose custom functions or another model.
  const run = await consume(await client.workflowAgents.preview({
    tools: [{ type: 'mcp', server_label: 'deepwiki', connection_origin: 'service', required: true,
      allowed_tools: ['read_wiki_structure'],
      transport: { type: 'http', server_url: 'https://mcp.deepwiki.com/mcp' } }],
    input_schema: { type: 'object', properties: { repo: { type: 'string' } }, required: ['repo'], additionalProperties: false },
    input: { repo: 'modelcontextprotocol/python-sdk' },
    code: `async (input, emit) => {
      await emit({ phase: 'discovering' });
      await tools.search_tools({ server: 'deepwiki', query: 'read_wiki_structure' });
      const result = await tools.call_tool({
        server: 'deepwiki', name: 'read_wiki_structure', arguments: { repoName: input.repo },
      });
      if (result.error !== null) throw new Error(JSON.stringify(result.error));
      return result.output;
    }`,
    stream: true, 'Idempotency-Key': randomUUID(),
  }))
  assert.ok(run.result)
  console.log('MCP callback passed:', JSON.stringify(run.result).slice(0, 500))
} finally {
  await cleanup()
}
