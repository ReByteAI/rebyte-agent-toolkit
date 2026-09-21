import { APIResource } from '../../core/resource';
import { APIPromise } from '../../core/api-promise';
import { CursorPage, PagePromise } from '../../core/pagination';
import type { RequestOptions } from '../../internal/request-options';
import { path } from '../../internal/utils/path';
import type { ScheduleRun, ScheduleListParams } from './types';

export type ScheduleRunsPage = CursorPage<ScheduleRun>;
export class ScheduleRuns extends APIResource {
  /** A just-accepted trigger can briefly return 404 while its durable admission commits. */
  retrieve(scheduleID: string, runID: string, options?: RequestOptions): APIPromise<ScheduleRun> {
    return this._client.get(path`/schedules/${scheduleID}/runs/${runID}`, { ...options, __security: { bearerAuth: true } });
  }
  list(scheduleID: string, query: ScheduleListParams = {}, options?: RequestOptions): PagePromise<ScheduleRunsPage, ScheduleRun> {
    return this._client.getAPIList(path`/schedules/${scheduleID}/runs`, CursorPage<ScheduleRun>, {
      ...options, query, __security: { bearerAuth: true },
    });
  }
  /** Request cancellation; poll the run until terminal. Completed tool side effects are not undone. */
  cancel(scheduleID: string, runID: string, options?: RequestOptions): APIPromise<ScheduleRun> {
    return this._client.post(path`/schedules/${scheduleID}/runs/${runID}/cancel`, { ...options, body: {}, __security: { bearerAuth: true } });
  }
}
