import { APIResource } from 'openai/core/resource';
import { APIPromise } from 'openai/core/api-promise';
import { Stream } from 'openai/core/streaming';
import { buildHeaders } from '../../request';
import type { RequestOptions } from '../../request';
import { path } from '../../request';
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
