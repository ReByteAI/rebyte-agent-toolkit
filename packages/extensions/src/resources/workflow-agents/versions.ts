import { APIResource } from 'openai/core/resource';
import { APIPromise } from 'openai/core/api-promise';
import { AbstractPage, PagePromise, type CursorPageResponse, type PageRequestOptions } from 'openai/core/pagination';
import type { OpenAI } from 'openai/client';
import type { RequestOptions } from '../../request';

import { path } from '../../request';
import type { WorkflowVersion, WorkflowVersionCreateParams, WorkflowVersionListParams } from './types';

export class WorkflowVersions extends APIResource {
  /** Append a draft. Use base_version to retain confidential execution configuration. */
  create(agentID: string, body: WorkflowVersionCreateParams, options?: RequestOptions): APIPromise<WorkflowVersion> {
    return this._client.post(path`/workflow-agents/${agentID}/versions`, {
      maxRetries: 0, ...options, body, __security: { bearerAuth: true },
    });
  }
  retrieve(agentID: string, version: number, options?: RequestOptions): APIPromise<WorkflowVersion> {
    return this._client.get(path`/workflow-agents/${agentID}/versions/${version}`, {
      ...options, __security: { bearerAuth: true },
    });
  }
  list(agentID: string, query: WorkflowVersionListParams = {}, options?: RequestOptions): PagePromise<WorkflowVersionsPage, WorkflowVersion> {
    return this._client.getAPIList(path`/workflow-agents/${agentID}/versions`, WorkflowVersionsPage, {
      ...options, query, __security: { bearerAuth: true },
    });
  }
}

/** Versions use a descending numeric `before` cursor, not an `after` resource ID. */
export class WorkflowVersionsPage extends AbstractPage<WorkflowVersion> {
  data: WorkflowVersion[];
  has_more: boolean;
  constructor(client: OpenAI, response: Response, body: CursorPageResponse<WorkflowVersion>, options: ConstructorParameters<typeof AbstractPage>[3]) {
    super(client, response, body, options);
    this.data = body.data;
    this.has_more = body.has_more;
  }
  getPaginatedItems(): WorkflowVersion[] { return this.data; }
  nextPageRequestOptions(): PageRequestOptions | null {
    const last = this.data[this.data.length - 1];
    if (!this.has_more || !last) return null;
    return { ...this.options, query: { ...this.options.query, before: last.version } };
  }
}
