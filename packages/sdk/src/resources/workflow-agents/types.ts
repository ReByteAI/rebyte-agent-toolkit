// Rebyte Workflow Agents API. See packages/sdk/UPSTREAM.md.
import type { AgentTool, PersistedAgentToolParam } from '../beta/agents/agents';
import type { RebyteSandbox } from '../../rebyte-sandbox';

export type WorkflowJSON = null | boolean | number | string | WorkflowJSON[] | { [key: string]: WorkflowJSON };

/** Saved server tools only. Client functions and nested dynamic workflows are not supported. */
export type WorkflowToolParam =
  | PersistedAgentToolParam.PersistedAgentToolConfigParamMcp
  | (Omit<PersistedAgentToolParam.PersistedAgentToolConfigParamWebSearch, 'mode' | 'location'> & {
      mode?: 'disabled' | 'live' | null;
      location?: null;
    });
export type WorkflowTool =
  | AgentTool.AgentToolResourceMcp
  | (Omit<AgentTool.AgentToolResourceWebSearch, 'mode' | 'location'> & {
      mode: 'disabled' | 'live';
      location: null;
    });

export interface WorkflowConfiguration {
  tools?: WorkflowToolParam[];
  environment?: { type: 'none' } | RebyteSandbox;
  vault_ids?: string[];
}
export interface WorkflowDefinition extends WorkflowConfiguration {
  /** JavaScript function expression: async (input, emit) => { ... }. Maximum 32,768 code units. */
  code: string;
  input_schema: Record<string, unknown>;
}
/** Public snapshots omit private environment setup and transport headers. */
export interface WorkflowDefinitionSnapshot {
  code: string;
  input_schema: Record<string, unknown>;
  tools: WorkflowTool[];
  environment: { type: 'none' | 'openai_hosted' };
  vault_ids: string[];
  source_hash: string;
}
export interface WorkflowAgent {
  object: 'workflow_agent';
  id: string;
  name: string;
  metadata: Record<string, string>;
  latest_version: number;
  published_version: number | null;
  /** Unix seconds. */
  created_at: number;
  /** Unix seconds. */
  updated_at: number;
}
export interface WorkflowVersion extends WorkflowDefinitionSnapshot {
  object: 'workflow_agent.version';
  agent_id: string;
  version: number;
  /** Unix seconds. */
  created_at: number;
  /** Unix seconds, or null for an unpublished draft. */
  published_at: number | null;
  tested_run_id: string | null;
}
export interface WorkflowRun extends WorkflowDefinitionSnapshot {
  object: 'workflow_agent.run';
  id: string;
  agent_id: string | null;
  version: number | null;
  /** True for both unsaved previews and saved-version tests. */
  preview: boolean;
  status: 'preparing' | 'in_progress' | 'completed' | 'failed' | 'cancelled';
  input: WorkflowJSON;
  result: WorkflowJSON;
  logs: string[];
  error: string | null;
  execution_id: string | null;
  /** Unix milliseconds (unlike created_at and completed_at). */
  expires_at: number;
  /** Unix seconds. */
  created_at: number;
  /** Unix seconds. */
  completed_at: number | null;
}
export interface WorkflowAgentDeleted {
  object: 'workflow_agent.deleted';
  id: string;
  deleted: true;
}
export interface WorkflowRunDeleted {
  object: 'workflow_agent.run.deleted';
  id: string;
  deleted: true;
}
export interface WorkflowAgentCreateParams extends WorkflowDefinition {
  name: string;
  metadata?: Record<string, string>;
}
export interface WorkflowListParams {
  limit?: number;
  after?: string;
}
export type WorkflowVersionCreateParams = WorkflowDefinition | {
  /** Retain this version's private tools, environment and vault configuration. */
  base_version: number;
  code: string;
  input_schema: Record<string, unknown>;
};
export interface WorkflowVersionListParams {
  limit?: number;
  /** Versions are returned newest first. */
  before?: number;
}
export interface WorkflowExecutionParams {
  input: WorkflowJSON;
  stream?: boolean;
  /** HTTP header. Reuse for the same logical request; a different body returns 409. */
  'Idempotency-Key'?: string;
}
export interface WorkflowRunCreateParams extends WorkflowExecutionParams {
  /** Defaults to the published version. Explicit versions must have been published. */
  version?: number;
}
export interface WorkflowTestParams extends WorkflowExecutionParams {
  /** Required: testing never silently picks a different draft. */
  version: number;
}
export interface WorkflowPreviewParams extends WorkflowDefinition, WorkflowExecutionParams {}
export interface WorkflowPublishParams {
  version: number;
  /** A successful, non-deleted test of this exact Agent and version. */
  test_run_id: string;
}
export interface WorkflowEventListParams {
  /** Replay events after this sequence. Keep it a string to preserve 64-bit precision. */
  after?: string;
}
export interface WorkflowDraft {
  name: string;
  summary: string;
  code: string;
  input_schema: Record<string, unknown>;
  input: WorkflowJSON;
}
export interface WorkflowGenerateParams extends WorkflowConfiguration {
  prompt: string;
  draft?: WorkflowDraft;
  preview_error?: string;
  stream?: boolean;
}
export interface WorkflowGenerateResponse { draft: WorkflowDraft }
export type WorkflowGenerationEvent =
  | { type: 'generation.started'; sequence: string }
  | { type: 'generation.delta'; sequence: string; delta: string }
  | { type: 'generation.completed'; sequence: string; draft: WorkflowDraft };

export interface WorkflowRunEventBase {
  event_id: string;
  created_at: number;
  run_id: string;
  /** Persist this cursor to resume an event-only subscription. */
  sequence: string;
}
export type WorkflowRunEvent = WorkflowRunEventBase & (
  | { type: 'workflow.run.created'; run: WorkflowRun }
  | { type: 'workflow.run.started'; execution_id: string; run: WorkflowRun }
  | { type: 'workflow.run.output'; execution_id: string; value: WorkflowJSON }
  | { type: 'workflow.run.tool.started'; execution_id: string;
      call: { callId: string; name: string; arguments: WorkflowJSON } }
  | { type: 'workflow.run.tool.completed'; execution_id: string; call_id: string; result?: WorkflowJSON }
  | { type: 'workflow.run.tool.failed'; execution_id: string; call_id: string; error: string }
  | { type: 'workflow.run.completed'; run: WorkflowRun }
  | { type: 'workflow.run.failed'; run: WorkflowRun }
  | { type: 'workflow.run.cancelled'; run: WorkflowRun }
);
