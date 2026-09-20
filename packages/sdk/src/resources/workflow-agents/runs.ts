import { APIResource } from '../../core/resource';
import { APIPromise } from '../../core/api-promise';
import { CursorPage, PagePromise } from '../../core/pagination';
import { Stream } from '../../core/streaming';
import type { RequestOptions } from '../../internal/request-options';
import { path } from '../../internal/utils/path';
import { WorkflowRunEvents } from './events';
import { workflowPostOptions } from './request';
import type { WorkflowListParams, WorkflowRun, WorkflowRunCreateParams, WorkflowRunDeleted, WorkflowRunEvent } from './types';

export type WorkflowRunsPage = CursorPage<WorkflowRun>;
export class WorkflowRuns extends APIResource {
  events = new WorkflowRunEvents(this._client);

  /** Execute a published version directly. Always check the terminal run status. */
  create(agentID: string, body: WorkflowRunCreateParams & { stream: true }, options?: RequestOptions): APIPromise<Stream<WorkflowRunEvent>>;
  create(agentID: string, body: WorkflowRunCreateParams & { stream?: false }, options?: RequestOptions): APIPromise<WorkflowRun>;
  create(agentID: string, body: WorkflowRunCreateParams, options?: RequestOptions): APIPromise<WorkflowRun | Stream<WorkflowRunEvent>>;
  create(agentID: string, body: WorkflowRunCreateParams, options?: RequestOptions): APIPromise<WorkflowRun | Stream<WorkflowRunEvent>> {
    return this._client.post(path`/workflow-agents/${agentID}/runs`, workflowPostOptions(body, options));
  }
  retrieve(runID: string, options?: RequestOptions): APIPromise<WorkflowRun> {
    return this._client.get(path`/workflow-agents/runs/${runID}`, { ...options, __security: { bearerAuth: true } });
  }
  /** List runs across the current organization, including previews and tests. */
  list(query: WorkflowListParams = {}, options?: RequestOptions): PagePromise<WorkflowRunsPage, WorkflowRun> {
    return this._client.getAPIList('/workflow-agents/runs', CursorPage<WorkflowRun>, {
      ...options, query, __security: { bearerAuth: true },
    });
  }
  /** Cancel active execution. Completed tool side effects are not undone. */
  cancel(runID: string, options?: RequestOptions): APIPromise<WorkflowRun> {
    return this._client.post(path`/workflow-agents/runs/${runID}/cancel`, {
      ...options, body: {}, __security: { bearerAuth: true },
    });
  }
  /** Delete a terminal run and clean up its tool environment. Cancel active runs first. */
  delete(runID: string, options?: RequestOptions): APIPromise<WorkflowRunDeleted> {
    return this._client.delete(path`/workflow-agents/runs/${runID}`, { ...options, __security: { bearerAuth: true } });
  }
}
