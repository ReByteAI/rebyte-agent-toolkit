import type { RebyteSandbox } from '../../rebyte-sandbox';
import type { WorkflowJSON } from '../workflow-agents/types';

/** Public schedule resources; private environment setup is never returned. */
export type ScheduleTarget =
  | {
      type: "agent";
      agent_id: string;
      session_mode: "continuous" | "isolated";
      input: string;
      environment: { type: "none" | "openai_hosted" };
      vault_ids: string[];
    }
  | {
      type: "workflow";
      workflow_agent_id: string;
      version: number;
      input: unknown;
    };

export type ScheduleTiming =
  | { type: "cron"; expression: string; timezone: string }
  | { type: "once"; at: string };

export interface Schedule {
  object: "schedule";
  id: string;
  name: string;
  target: ScheduleTarget;
  timing: ScheduleTiming;
  paused: boolean;
  max_runs: number;
  timeout_seconds: number;
  run_count: number;
  session_id: string | null;
  active_run_id: string | null;
  generation: number;
  revision: number;
  created_at: number;
  updated_at: number;
}

export interface ScheduleRun {
  object: "schedule.run";
  id: string;
  schedule_id: string;
  schedule_revision: number;
  trigger: "scheduled" | "manual";
  status:
    | "preparing"
    | "running"
    | "completed"
    | "failed"
    | "cancelled"
    | "skipped";
  target: ScheduleTarget;
  session_id: string | null;
  turn_id: string | null;
  workflow_run_id: string | null;
  timeout_seconds: number;
  created_at: number;
  completed_at: number | null;
  error: string | null;
  result: unknown;
  usage: unknown;
}

export interface ScheduleDetail extends Schedule {
  runtime: {
    next_run_times: string[];
    paused: boolean;
    overlap_skipped: number;
  };
}

/** Confidential environment setup is accepted on creation, then redacted on reads. */
export type ScheduleTargetParam =
  | { type: 'agent'; agent_id: string; session_mode: 'continuous' | 'isolated'; input: string;
      environment?: { type: 'none' } | RebyteSandbox; vault_ids?: string[] }
  | { type: 'workflow'; workflow_agent_id: string; version: number; input: WorkflowJSON };
export interface ScheduleCreateParams {
  name: string; target: ScheduleTargetParam; timing: ScheduleTiming;
  /** Lifetime run cap: 1–100; defaults to 100 on creation. */
  paused?: boolean; max_runs?: number; timeout_seconds?: number;
}
export interface ScheduleUpdateParams {
  name?: string; timing?: ScheduleTiming; input?: WorkflowJSON;
  /** Lifetime run cap: 1–100; defaults to 100 on creation. */
  paused?: boolean; max_runs?: number; timeout_seconds?: number;
}
export interface ScheduleListParams { limit?: number; after?: string; }
export interface ScheduleTriggerParams { 'Idempotency-Key'?: string; }
export interface ScheduleTrigger { object: 'schedule.trigger'; run_id: string; }
export interface ScheduleDeleted { object: 'schedule.deleted'; id: string; deleted: true; }
