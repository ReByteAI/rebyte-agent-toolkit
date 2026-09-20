import { buildHeaders } from '../../internal/headers';
import type { RequestOptions } from '../../internal/request-options';
import { WorkflowEventStream } from './stream';

/** Do not replay code after an ambiguous transport failure unless the caller opts in. */
export function workflowPostOptions(
  params: { stream?: boolean; 'Idempotency-Key'?: string }, options?: RequestOptions,
): RequestOptions {
  const { 'Idempotency-Key': key, ...body } = params;
  return {
    maxRetries: 0,
    ...options,
    body,
    stream: params.stream ?? false,
    headers: buildHeaders([
      { Accept: params.stream ? 'text/event-stream' : 'application/json',
        ...(key === undefined ? {} : { 'Idempotency-Key': key }) },
      options?.headers,
    ]),
    __streamClass: WorkflowEventStream,
    __security: { bearerAuth: true },
  };
}
