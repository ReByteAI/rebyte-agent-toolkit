import { APIResource } from '../../core/resource';
import { APIPromise } from '../../core/api-promise';
import { Stream } from '../../core/streaming';
import { buildHeaders } from '../../internal/headers';
import type { RequestOptions } from '../../internal/request-options';
import { path } from '../../internal/utils/path';
import { WorkflowEventStream } from './stream';
import type { WorkflowEventListParams, WorkflowRunEvent } from './types';

export class WorkflowRunEvents extends APIResource {
  /** Replay and follow persisted events. Disconnecting this subscription does not cancel execution. */
  stream(runID: string, query: WorkflowEventListParams = {}, options?: RequestOptions): APIPromise<Stream<WorkflowRunEvent>> {
    return this._client.get(path`/workflow-agents/runs/${runID}/events`, {
      ...options, query, stream: true,
      headers: buildHeaders([{ Accept: 'text/event-stream' }, options?.headers]),
      __streamClass: WorkflowEventStream, __security: { bearerAuth: true },
    });
  }
}
