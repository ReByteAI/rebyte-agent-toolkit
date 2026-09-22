import { APIResource } from 'openai/core/resource';
import { APIPromise } from 'openai/core/api-promise';
import { CursorPage, PagePromise } from 'openai/core/pagination';
import type { RequestOptions } from '../../request';
import { buildHeaders } from '../../request';
import { path } from '../../request';
import { ScheduleRuns } from './runs';
import type { Schedule, ScheduleDetail, ScheduleCreateParams, ScheduleUpdateParams, ScheduleListParams,
  ScheduleTriggerParams, ScheduleTrigger, ScheduleDeleted } from './types';

export type SchedulesPage = CursorPage<Schedule>;

/** Organization-owned schedules; independent from UI Workspace scheduled tasks. */
export class Schedules extends APIResource {
  runs = new ScheduleRuns(this._client);

  create(body: ScheduleCreateParams, options?: RequestOptions): APIPromise<ScheduleDetail> {
    return this._client.post('/schedules', { maxRetries: 0, ...options, body, __security: { bearerAuth: true } });
  }
  retrieve(scheduleID: string, options?: RequestOptions): APIPromise<ScheduleDetail> {
    return this._client.get(path`/schedules/${scheduleID}`, { ...options, __security: { bearerAuth: true } });
  }
  list(query: ScheduleListParams = {}, options?: RequestOptions): PagePromise<SchedulesPage, Schedule> {
    return this._client.getAPIList('/schedules', CursorPage<Schedule>, { ...options, query, __security: { bearerAuth: true } });
  }
  /** Edit future input or timing. Execution target and context mode are immutable. */
  update(scheduleID: string, body: ScheduleUpdateParams, options?: RequestOptions): APIPromise<ScheduleDetail> {
    return this._client.patch(path`/schedules/${scheduleID}`, { maxRetries: 0, ...options, body, __security: { bearerAuth: true } });
  }
  /** Pause future automatic triggers; an active run continues. */
  pause(scheduleID: string, options?: RequestOptions): APIPromise<ScheduleDetail> {
    return this._client.post(path`/schedules/${scheduleID}/pause`, { ...options, body: {}, __security: { bearerAuth: true } });
  }
  resume(scheduleID: string, options?: RequestOptions): APIPromise<ScheduleDetail> {
    return this._client.post(path`/schedules/${scheduleID}/resume`, { ...options, body: {}, __security: { bearerAuth: true } });
  }
  /** Accept a manual trigger. Reuse Idempotency-Key after an ambiguous response to avoid a duplicate run. */
  trigger(scheduleID: string, params: ScheduleTriggerParams = {}, options?: RequestOptions): APIPromise<ScheduleTrigger> {
    const key = params['Idempotency-Key'];
    return this._client.post(path`/schedules/${scheduleID}/trigger`, { maxRetries: 0, ...options, body: {},
      headers: buildHeaders([key === undefined ? undefined : { 'Idempotency-Key': key }, options?.headers]),
      __security: { bearerAuth: true } });
  }
  /** Future continuous runs use a new Session with current Agent config. Old history and files are preserved. */
  resetSession(scheduleID: string, options?: RequestOptions): APIPromise<ScheduleDetail> {
    return this._client.post(path`/schedules/${scheduleID}/reset-session`, { maxRetries: 0, ...options, body: {}, __security: { bearerAuth: true } });
  }
  /** Archive an idle schedule, retaining run history and Sessions. Cancel active runs first. */
  delete(scheduleID: string, options?: RequestOptions): APIPromise<ScheduleDeleted> {
    return this._client.delete(path`/schedules/${scheduleID}`, { ...options, __security: { bearerAuth: true } });
  }
}
