// Rebyte-specific resource; independent of the Managed Agents beta API.
import { APIResource } from '../../core/resource';
import { APIPromise } from '../../core/api-promise';
import { CursorPage, PagePromise } from '../../core/pagination';
import { Stream } from '../../core/streaming';
import type { RequestOptions } from '../../internal/request-options';
import { path } from '../../internal/utils/path';
import { WorkflowRuns } from './runs';
import { WorkflowVersions } from './versions';
import { workflowPostOptions } from './request';
import type {
  WorkflowAgent, WorkflowAgentCreateParams, WorkflowAgentDeleted, WorkflowListParams,
  WorkflowGenerateParams, WorkflowGenerateResponse, WorkflowGenerationEvent,
  WorkflowPreviewParams, WorkflowPublishParams, WorkflowRun, WorkflowRunEvent, WorkflowTestParams,
} from './types';

export type WorkflowAgentsPage = CursorPage<WorkflowAgent>;
export class WorkflowAgents extends APIResource {
  versions = new WorkflowVersions(this._client);
  runs = new WorkflowRuns(this._client);

  /** Create an Agent and draft version 1. This does not execute or publish code. */
  create(body: WorkflowAgentCreateParams, options?: RequestOptions): APIPromise<WorkflowAgent> {
    return this._client.post('/workflow-agents', { maxRetries: 0, ...options, body, __security: { bearerAuth: true } });
  }
  retrieve(agentID: string, options?: RequestOptions): APIPromise<WorkflowAgent> {
    return this._client.get(path`/workflow-agents/${agentID}`, { ...options, __security: { bearerAuth: true } });
  }
  list(query: WorkflowListParams = {}, options?: RequestOptions): PagePromise<WorkflowAgentsPage, WorkflowAgent> {
    return this._client.getAPIList('/workflow-agents', CursorPage<WorkflowAgent>, {
      ...options, query, __security: { bearerAuth: true },
    });
  }
  /** Prevent new use. Existing run records must be deleted separately. */
  delete(agentID: string, options?: RequestOptions): APIPromise<WorkflowAgentDeleted> {
    return this._client.delete(path`/workflow-agents/${agentID}`, { ...options, __security: { bearerAuth: true } });
  }
  /** Publish a version using its successful saved-version test. */
  publish(agentID: string, body: WorkflowPublishParams, options?: RequestOptions): APIPromise<WorkflowAgent> {
    return this._client.post(path`/workflow-agents/${agentID}/publish`, {
      maxRetries: 0, ...options, body, __security: { bearerAuth: true },
    });
  }

  /** Execute an unsaved definition. A preview cannot satisfy the publication test requirement. */
  preview(body: WorkflowPreviewParams & { stream: true }, options?: RequestOptions): APIPromise<Stream<WorkflowRunEvent>>;
  preview(body: WorkflowPreviewParams & { stream?: false }, options?: RequestOptions): APIPromise<WorkflowRun>;
  preview(body: WorkflowPreviewParams, options?: RequestOptions): APIPromise<WorkflowRun | Stream<WorkflowRunEvent>>;
  preview(body: WorkflowPreviewParams, options?: RequestOptions): APIPromise<WorkflowRun | Stream<WorkflowRunEvent>> {
    return this._client.post('/workflow-agents/preview', workflowPostOptions(body, options));
  }

  /** Test an explicit saved version with real tools. Inspect status before publishing. */
  test(agentID: string, body: WorkflowTestParams & { stream: true }, options?: RequestOptions): APIPromise<Stream<WorkflowRunEvent>>;
  test(agentID: string, body: WorkflowTestParams & { stream?: false }, options?: RequestOptions): APIPromise<WorkflowRun>;
  test(agentID: string, body: WorkflowTestParams, options?: RequestOptions): APIPromise<WorkflowRun | Stream<WorkflowRunEvent>>;
  test(agentID: string, body: WorkflowTestParams, options?: RequestOptions): APIPromise<WorkflowRun | Stream<WorkflowRunEvent>> {
    return this._client.post(path`/workflow-agents/${agentID}/test`, workflowPostOptions(body, options));
  }

  /** Generate or revise code using Rebyte's platform-funded Workflow Builder. Does not execute it. */
  generate(body: WorkflowGenerateParams & { stream: true }, options?: RequestOptions): APIPromise<Stream<WorkflowGenerationEvent>>;
  generate(body: WorkflowGenerateParams & { stream?: false }, options?: RequestOptions): APIPromise<WorkflowGenerateResponse>;
  generate(body: WorkflowGenerateParams, options?: RequestOptions): APIPromise<WorkflowGenerateResponse | Stream<WorkflowGenerationEvent>>;
  generate(body: WorkflowGenerateParams, options?: RequestOptions): APIPromise<WorkflowGenerateResponse | Stream<WorkflowGenerationEvent>> {
    return this._client.post('/workflow-agents/generate', workflowPostOptions(body, options));
  }
}
