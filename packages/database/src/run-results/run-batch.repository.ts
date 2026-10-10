// Copyright (c) 2026 Ada Technology. All rights reserved.
import { and, eq } from 'drizzle-orm';

import type { DatabaseExecutor } from '../database-executor.js';
import { readOpenDatabase, type DatabaseHandle } from '../database-handle.js';
import { ownerCondition, type OwnerScope } from '../ownership/owner-scope.js';
import { runs } from '../schema/runs.schema.js';
import type { RunStatus } from '../runs/run.constant.js';
import { saveCheckpoint } from '../runs/run.repository.js';
import {
  writeCommands,
  writeEquityPoints,
  writeFills,
  writeSignals,
  writeWindows,
} from './run-result-append.js';
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

function createWriter(target: BatchTarget, status: RunStatus): RunBatchWriter {
  return {
    readStatus: () => Promise.resolve(status),
    appendResults: (rows) => appendResults(target, rows),
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
