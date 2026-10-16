// Copyright (c) 2026 Ada Technology. All rights reserved.
import { and, eq } from 'drizzle-orm';

import { writeAlerts } from '../alerts/alert-write.js';
import { insertAnalystDecision } from '../analyst/analyst-decision.repository.js';
import type { DatabaseExecutor } from '../database-executor.js';
import { readOpenDatabase, type DatabaseHandle } from '../database-handle.js';
import { ownerCondition, type OwnerScope } from '../ownership/owner-scope.js';
import { runs } from '../schema/runs.schema.js';
import type { RunStatus } from '../runs/run.constant.js';
import { clearDataWait, recordDataWait } from '../runs/run-data-wait.js';
import { recordGoalOutcome } from '../runs/run-goal.js';
import { saveCheckpoint } from '../runs/run.repository.js';
import { transitionRun } from '../runs/run-transition.js';
import { RUN_STATUS as RUN_STATUS_VALUES, RUN_TRANSITION_OUTCOME } from '../runs/run.constant.js';
import {
  writeCommands,
  writeEquityPoints,
  writeFills,
  writeSignals,
  writeWindows,
} from './run-result-append.js';
import { publishAnalystEvent } from '../run-events/publish-analyst-event.js';
import { publishStepEvents } from '../run-events/publish-step-events.js';
import { writeOrders, writePositions } from './run-result-upsert.js';
import type { RunBatchRepository, RunBatchWriter, RunResultRows } from './run-batch.types.js';
import type { AppendResult } from './run-result.types.js';

type BatchTarget = {
  readonly executor: DatabaseExecutor;
  readonly scope: OwnerScope;
  readonly runId: string;
};

async function appendResults(target: BatchTarget, rows: RunResultRows): Promise<AppendResult> {
  const base = {
    executor: target.executor,
    ownerUserId: target.scope.ownerUserId,
    runId: target.runId,
  };
  const counts = [
    await writeSignals({ ...base, rows: rows.signals }),
    await writeOrders({ ...base, rows: rows.orders }),
    await writeFills({ ...base, rows: rows.fills }),
    await writePositions({ ...base, rows: rows.positions }),
    await writeEquityPoints({ ...base, rows: rows.equityPoints }),
    await writeCommands({ ...base, rows: rows.commands }),
  ];
  return { written: counts.reduce((sum, count) => sum + count, 0) };
}

function createRunControlWriter(
  target: BatchTarget,
): Pick<RunBatchWriter, 'recordDataWait' | 'clearDataWait' | 'completeRun' | 'publishStepEvents'> {
  return {
    completeRun: async () =>
      (
        await transitionRun(target.executor, target.scope, {
          runId: target.runId,
          to: RUN_STATUS_VALUES.COMPLETED,
        })
      ).outcome === RUN_TRANSITION_OUTCOME.TRANSITIONED,
    publishStepEvents: (candleTime) =>
      publishStepEvents({
        executor: target.executor,
        ownerUserId: target.scope.ownerUserId,
        runId: target.runId,
        candleTime,
      }),
    recordDataWait: (params) =>
      recordDataWait(target.executor, target.scope, { runId: target.runId, ...params }),
    clearDataWait: () => clearDataWait(target.executor, target.scope, target.runId),
  };
}

function createWriter(target: BatchTarget, status: RunStatus): RunBatchWriter {
  return {
    readStatus: () => Promise.resolve(status),
    appendResults: (rows) => appendResults(target, rows),
    appendAlerts: async (rows) => ({
      written: await writeAlerts({
        executor: target.executor,
        ownerUserId: target.scope.ownerUserId,
        runId: target.runId,
        rows,
      }),
    }),
    appendWindows: async (rows) => ({
      written: await writeWindows({
        executor: target.executor,
        ownerUserId: target.scope.ownerUserId,
        runId: target.runId,
        rows,
      }),
    }),
    saveCheckpoint: (params) =>
      saveCheckpoint(target.executor, target.scope, { runId: target.runId, ...params }),
    recordGoalOutcome: (params) =>
      recordGoalOutcome(target.executor, target.scope, { runId: target.runId, ...params }),
    appendAnalystDecision: async (input): Promise<boolean> => {
      const isNew = await insertAnalystDecision(target.executor, target.scope, input);
      if (isNew) {
        await publishAnalystEvent({
          executor: target.executor,
          runId: target.runId,
          candleTime: input.candleTime,
        });
      }
      return isNew;
    },
    ...createRunControlWriter(target),
  };
}

// A linha da execução é travada (`FOR UPDATE`) antes de qualquer gravação: o cancelamento concorrente espera o
// fim do lote, e o status lido aqui continua verdadeiro até o COMMIT.
async function lockRunStatus(target: BatchTarget): Promise<RunStatus | undefined> {
  const rows = await target.executor
    .select({ status: runs.status })
    .from(runs)
    .where(and(ownerCondition(target.scope, runs.userId), eq(runs.id, target.runId)))
    .for('update')
    .limit(1);
  return rows[0]?.status as RunStatus | undefined;
}

export function createRunBatchRepository(handle: DatabaseHandle): RunBatchRepository {
  const { database } = readOpenDatabase(handle);
  return {
    runInBatch: (scope, runId, work) =>
      database.transaction(async (transaction) => {
        const target: BatchTarget = { executor: transaction, scope, runId };
        const status = await lockRunStatus(target);
        if (status === undefined) return undefined;
        return work(createWriter(target, status));
      }),
  };
}
