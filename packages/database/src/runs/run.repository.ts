// Copyright (c) 2026 Ada Technology. All rights reserved.
import { and, eq, sql } from 'drizzle-orm';

import { readOpenDatabase, type DatabaseHandle } from '../database-handle.js';
import type { DatabaseExecutor } from '../database-executor.js';
import { readJsonb, toJsonb } from '../jsonb.js';
import { ownerCondition, type OwnerScope } from '../ownership/owner-scope.js';
import { runs } from '../schema/runs.schema.js';
import { strategyVersions } from '../schema/strategies.schema.js';
import { RUN_STATUS } from './run.constant.js';
import { listRuns } from './run-list.js';
import { isOwnedRun } from './run-ownership.js';
import { RUN_COLUMNS, toRunRecord } from './run-record.mapper.js';
import { failOrphanedRuns, transitionRun } from './run-transition.js';
import type {
  CreateRunParams,
  EngineCheckpoint,
  RunRecord,
  RunRepository,
  SaveCheckpointParams,
} from './run.types.js';

async function isOwnedVersion(
  executor: DatabaseExecutor,
  scope: OwnerScope,
  versionId: string,
): Promise<boolean> {
  const rows = await executor
    .select({ id: strategyVersions.id })
    .from(strategyVersions)
    .where(and(ownerCondition(scope, strategyVersions.userId), eq(strategyVersions.id, versionId)))
    .limit(1);
  return rows.length > 0;
}

async function createRun(
  executor: DatabaseExecutor,
  scope: OwnerScope,
  params: CreateRunParams,
): Promise<RunRecord | undefined> {
  if (!(await isOwnedVersion(executor, scope, params.strategyVersionId))) return undefined;
  const origin = params.migratedFromRunId;
  if (origin !== undefined && !(await isOwnedRun(executor, scope, origin))) return undefined;
  const rows = await executor
    .insert(runs)
    .values({
      id: Bun.randomUUIDv7(),
      userId: scope.ownerUserId,
      strategyVersionId: params.strategyVersionId,
      kind: params.kind,
      symbol: params.symbol,
      timeframe: params.timeframe,
      runParameters: toJsonb(params.runParameters),
      runHash: params.runHash,
      engineVersion: params.engineVersion,
      signalEngineVersion: params.signalEngineVersion,
      metricsVersion: params.metricsVersion,
      periodStart: params.periodStart,
      periodEnd: params.periodEnd ?? null,
      migratedFromRunId: origin ?? null,
    })
    .returning(RUN_COLUMNS);
  const created = rows[0];
  if (created === undefined) throw new Error('INSERT de runs não devolveu a linha');
  return toRunRecord(created);
}

async function findRun(
  executor: DatabaseExecutor,
  scope: OwnerScope,
  runId: string,
): Promise<RunRecord | undefined> {
  const rows = await executor
    .select(RUN_COLUMNS)
    .from(runs)
    .where(and(ownerCondition(scope, runs.userId), eq(runs.id, runId)))
    .limit(1);
  const row = rows[0];
  return row === undefined ? undefined : toRunRecord(row);
}

// Só uma execução `running` grava, e `last_candle_time` só avança: o estado final e o passo antigo não sobrescrevem.
async function saveCheckpoint(
  executor: DatabaseExecutor,
  scope: OwnerScope,
  params: SaveCheckpointParams,
): Promise<boolean> {
  const rows = await executor
    .update(runs)
    .set({
      engineState: toJsonb(params.engineState),
      lastCandleTime: params.lastCandleTime,
      progress: sql`greatest(${runs.progress}, ${params.progress})`,
    })
    .where(
      and(
        ownerCondition(scope, runs.userId),
        eq(runs.id, params.runId),
        eq(runs.status, RUN_STATUS.RUNNING),
        sql`(${runs.lastCandleTime} is null or ${runs.lastCandleTime} < ${params.lastCandleTime})`,
      ),
    )
    .returning({ id: runs.id });
  return rows.length > 0;
}

async function readCheckpoint(
  executor: DatabaseExecutor,
  scope: OwnerScope,
  runId: string,
): Promise<EngineCheckpoint | undefined> {
  const rows = await executor
    .select({
      engineState: runs.engineState,
      lastCandleTime: runs.lastCandleTime,
      progress: runs.progress,
    })
    .from(runs)
    .where(and(ownerCondition(scope, runs.userId), eq(runs.id, runId)))
    .limit(1);
  const row = rows[0];
  if (row === undefined) return undefined;
  return {
    engineState: row.engineState === null ? undefined : readJsonb(row.engineState),
    lastCandleTime: row.lastCandleTime ?? undefined,
    progress: row.progress,
  };
}

export function createRunRepository(handle: DatabaseHandle): RunRepository {
  const { database } = readOpenDatabase(handle);
  return {
    createRun: (scope, params) => createRun(database, scope, params),
    findRun: (scope, runId) => findRun(database, scope, runId),
    listRuns: (scope, params) => listRuns(database, scope, params),
    transitionRun: (scope, params) => transitionRun(database, scope, params),
    saveCheckpoint: (scope, params) => saveCheckpoint(database, scope, params),
    readCheckpoint: (scope, runId) => readCheckpoint(database, scope, runId),
    failOrphanedRuns: (params) => failOrphanedRuns(database, params),
  };
}
