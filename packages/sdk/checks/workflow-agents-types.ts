// Compile the public package, including streaming overloads and rejected configurations.
import Rebyte, { type WorkflowRun, type WorkflowRunEvent, type WorkflowDraft } from '@rebyteai/agent-sdk';
import type { Stream } from '@rebyteai/agent-sdk/core/streaming';
import type { WorkflowDefinition } from '@rebyteai/agent-sdk/resources/workflow-agents/index';

async function contracts(client: Rebyte, stream: boolean) {
  const definition: WorkflowDefinition = { code: 'async input => input', input_schema: {} };
  const run: WorkflowRun = await client.workflowAgents.preview({ ...definition, input: null });
  const events: Stream<WorkflowRunEvent> = await client.workflowAgents.runs.create('wfa_1', { input: {}, stream: true });
  const either: WorkflowRun | Stream<WorkflowRunEvent> = await client.workflowAgents.test('wfa_1', { input: [], version: 1, stream });
  const draft: WorkflowDraft = (await client.workflowAgents.generate({ prompt: 'Sum numbers' })).draft;
  for await (const event of await client.workflowAgents.generate({ prompt: 'Sum numbers', stream: true })) {
    if (event.type === 'generation.completed') event.draft.code.toUpperCase();
  }
  for await (const event of events) {
    if (event.type === 'workflow.run.tool.failed') event.error.toUpperCase();
    if (event.type === 'workflow.run.completed') event.run.result satisfies unknown;
  }
  // @ts-expect-error A saved-version test requires an explicit version.
  client.workflowAgents.test('wfa_1', { input: {} });
  // @ts-expect-error Workflow input is required, including when its value is null.
  client.workflowAgents.runs.create('wfa_1', {});
  // @ts-expect-error Client functions cannot be called from a Workflow Agent.
  const clientTool: WorkflowDefinition = { ...definition, tools: [{ type: 'function', name: 'local' }] };
  // @ts-expect-error Workflows support Rebyte-hosted or no environment, not self-hosted.
  const selfHosted: WorkflowDefinition = { ...definition, environment: { type: 'self_hosted' } };
  // @ts-expect-error 64-bit SSE sequences must remain strings.
  client.workflowAgents.runs.events.stream('run_1', { after: 123 });
  return { run, either, draft, clientTool, selfHosted };
}
void contracts;
