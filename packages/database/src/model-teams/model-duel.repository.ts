// Copyright (c) 2026 Ada Technology. All rights reserved.
import { and, asc, eq, inArray, isNull, sql } from 'drizzle-orm';

import type { DatabaseExecutor } from '../database-executor.js';
import { readOpenDatabase, type DatabaseHandle } from '../database-handle.js';
import { ownerCondition, type OwnerScope } from '../ownership/owner-scope.js';
import { RUN_COLUMNS, toRunRecord } from '../runs/run-record.mapper.js';
import type { RunRecord } from '../runs/run.types.js';
import { positions } from '../schema/positions.schema.js';
import { runs } from '../schema/runs.schema.js';

export const MODEL_DUEL_CURVE_MAXIMUM_POINTS = 1_000;

export type DuelEquityPoint = {
  readonly runId: string;
  readonly candleTime: number;
  readonly equity: string;
  readonly equityAtLow: string;
};

export type DuelTradeCount = { readonly runId: string; readonly trades: number };

type RawPoint = {
  readonly run_id: string;
  readonly candle_time: string | number;
  readonly equity: string;
  readonly equity_at_low: string;
};

export type ModelDuelRepository = {
  // As execuções do duelo (o grupo mora em `runs.request.duel.groupId`), só do dono e não apagadas, da mais antiga.
  readonly listDuelRuns: (scope: OwnerScope, duelId: string) => Promise<readonly RunRecord[]>;
  // As curvas de patrimônio das execuções (as mais recentes, no máximo `MODEL_DUEL_CURVE_MAXIMUM_POINTS` por execução).
  readonly readEquityCurves: (
    scope: OwnerScope,
    runIds: readonly string[],
  ) => Promise<readonly DuelEquityPoint[]>;
  // Operações fechadas por execução.
  readonly countClosedTrades: (
    scope: OwnerScope,
    runIds: readonly string[],
  ) => Promise<readonly DuelTradeCount[]>;
};

async function listDuelRuns(
  executor: DatabaseExecutor,
  scope: OwnerScope,
  duelId: string,
): Promise<readonly RunRecord[]> {
  const rows = await executor
    .select(RUN_COLUMNS)
    .from(runs)
    .where(
      and(
        ownerCondition(scope, runs.userId),
        isNull(runs.deletedAt),
        sql`${runs.request} -> 'duel' ->> 'groupId' = ${duelId}`,
      ),
    )
    .orderBy(asc(runs.createdAt), asc(runs.id));
  return rows.map(toRunRecord);
}

async function readEquityCurves(
  executor: DatabaseExecutor,
  scope: OwnerScope,
  runIds: readonly string[],
): Promise<readonly DuelEquityPoint[]> {
  if (runIds.length === 0) return [];
  const ids = sql.join(
    runIds.map((id) => sql`${id}::uuid`),
    sql`, `,
  );
  const rows: unknown = await executor.execute(sql`
    SELECT run_id, candle_time, equity::text AS equity, equity_at_low::text AS equity_at_low FROM (
      SELECT *, row_number() OVER (PARTITION BY run_id ORDER BY candle_time DESC) AS position
      FROM equity_points WHERE user_id = ${scope.ownerUserId}::uuid AND run_id IN (${ids})
    ) p WHERE p.position <= ${MODEL_DUEL_CURVE_MAXIMUM_POINTS} ORDER BY p.candle_time, p.run_id`);
  return (Array.isArray(rows) ? (rows as readonly RawPoint[]) : []).map((row) => ({
    runId: row.run_id,
    candleTime: Number(row.candle_time),
    equity: row.equity,
    equityAtLow: row.equity_at_low,
  }));
}

async function countClosedTrades(
  executor: DatabaseExecutor,
  scope: OwnerScope,
  runIds: readonly string[],
): Promise<readonly DuelTradeCount[]> {
  if (runIds.length === 0) return [];
  const rows = await executor
    .select({ runId: positions.runId, trades: sql<number>`count(*)::int` })
    .from(positions)
    .where(
      and(
        ownerCondition(scope, positions.userId),
        inArray(positions.runId, [...runIds]),
        eq(positions.status, 'closed'),
      ),
    )
    .groupBy(positions.runId);
  return rows;
}

export function createModelDuelRepository(handle: DatabaseHandle): ModelDuelRepository {
  const { database } = readOpenDatabase(handle);
  return {
    listDuelRuns: (scope, duelId) => listDuelRuns(database, scope, duelId),
    readEquityCurves: (scope, runIds) => readEquityCurves(database, scope, runIds),
    countClosedTrades: (scope, runIds) => countClosedTrades(database, scope, runIds),
  };
}
