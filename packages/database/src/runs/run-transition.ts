// Copyright (c) 2026 Ada Technology. All rights reserved.
import { and, eq, inArray, sql } from 'drizzle-orm';

import type { DatabaseExecutor } from '../database-executor.js';
import { toJsonb } from '../jsonb.js';
import { ownerCondition, type OwnerScope } from '../ownership/owner-scope.js';
import { runs } from '../schema/runs.schema.js';
import {
  RUN_STATUS,
  RUN_TRANSITION_OUTCOME,
  RUN_TRANSITION_SOURCES,
  TERMINAL_RUN_STATUSES,
  type RunKind,
  type RunStatus,
} from './run.constant.js';
import { RUN_COLUMNS, toRunRecord } from './run-record.mapper.js';
import type {
  FailOrphanedRunsParams,
  TransitionRunParams,
  TransitionRunResult,
} from './run.types.js';

function buildTransitionChanges(params: TransitionRunParams): Record<string, unknown> {
  return {
    status: params.to,
    ...(params.to === RUN_STATUS.RUNNING ? { startedAt: sql`now()` } : {}),
    ...(TERMINAL_RUN_STATUSES.includes(params.to) ? { finishedAt: sql`now()` } : {}),
    ...(params.metrics === undefined ? {} : { metrics: toJsonb(params.metrics) }),
    ...(params.errorCode === undefined ? {} : { errorCode: params.errorCode }),
  };
}

async function readStatus(
  executor: DatabaseExecutor,
  scope: OwnerScope,
  runId: string,
): Promise<RunStatus | undefined> {
  const rows = await executor
    .select({ status: runs.status })
    .from(runs)
    .where(and(ownerCondition(scope, runs.userId), eq(runs.id, runId)))
    .limit(1);
  return rows[0]?.status as RunStatus | undefined;
}

// A origem aceita está no WHERE: a transição inválida ou repetida não altera a linha.
export async function transitionRun(
  executor: DatabaseExecutor,
  scope: OwnerScope,
  params: TransitionRunParams,
): Promise<TransitionRunResult> {
  const sources = RUN_TRANSITION_SOURCES[params.to];
  const updated =
    sources.length === 0
      ? []
      : await executor
          .update(runs)
          .set(buildTransitionChanges(params))
          .where(
            and(
              ownerCondition(scope, runs.userId),
              eq(runs.id, params.runId),
              inArray(runs.status, [...sources]),
            ),
          )
          .returning(RUN_COLUMNS);
  const row = updated[0];
  if (row !== undefined) {
    return { outcome: RUN_TRANSITION_OUTCOME.TRANSITIONED, run: toRunRecord(row) };
  }
  const currentStatus = await readStatus(executor, scope, params.runId);
  if (currentStatus === undefined) return { outcome: RUN_TRANSITION_OUTCOME.NOT_FOUND };
  return { outcome: RUN_TRANSITION_OUTCOME.INVALID_TRANSITION, currentStatus };
}

export async function failOrphanedRuns(
  executor: DatabaseExecutor,
  params: FailOrphanedRunsParams,
): Promise<number> {
  if (params.kinds.length === 0) return 0;
  const kinds: RunKind[] = [...params.kinds];
  const rows = await executor
    .update(runs)
    .set({ status: RUN_STATUS.FAILED, errorCode: params.errorCode, finishedAt: sql`now()` })
    .where(and(eq(runs.status, RUN_STATUS.RUNNING), inArray(runs.kind, kinds)))
    .returning({ id: runs.id });
  return rows.length;
}
