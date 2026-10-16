// Copyright (c) 2026 Ada Technology. All rights reserved.
import { sql, type SQL } from 'drizzle-orm';

import type { DatabaseExecutor } from '../database-executor.js';
import type { OwnerScope } from '../ownership/owner-scope.js';
import { RUN_KIND, RUN_STATUS } from '../runs/run.constant.js';
import type { NoticeHistory, NoticeHistoryKey } from './notice-feed.types.js';

const HISTORY_KEYS_MAXIMUM = 50;

type RawRow = Readonly<Record<string, unknown>>;

function readText(row: RawRow, column: string): string | undefined {
  const value = row[column];
  return typeof value === 'string' ? value : undefined;
}

function toHistory(row: RawRow): NoticeHistory | undefined {
  const strategyVersionId = readText(row, 'strategy_version_id');
  const symbol = readText(row, 'symbol');
  const timeframe = readText(row, 'timeframe');
  const kind = readText(row, 'kind');
  const totalReturn = readText(row, 'total_return');
  const elapsed = Number(readText(row, 'elapsed') ?? Number.NaN);
  if (
    strategyVersionId === undefined ||
    symbol === undefined ||
    timeframe === undefined ||
    kind === undefined ||
    totalReturn === undefined ||
    !Number.isFinite(elapsed)
  ) {
    return undefined;
  }
  return { strategyVersionId, symbol, timeframe, kind, elapsedMilliseconds: elapsed, totalReturn };
}

function keyCondition(keys: readonly NoticeHistoryKey[]): SQL {
  const tuples = keys.map(
    (key) => sql`(${key.strategyVersionId}::uuid, ${key.symbol}::text, ${key.timeframe}::text)`,
  );
  return sql`(r.strategy_version_id, r.symbol, r.timeframe) IN (${sql.join(tuples, sql`, `)})`;
}

// O último backtest ou walk-forward concluído de cada (versão, par, vela): UMA consulta, o dono filtrado, sem nada por vela.
export async function listNoticeHistories(
  database: DatabaseExecutor,
  scope: OwnerScope,
  keys: readonly NoticeHistoryKey[],
): Promise<readonly NoticeHistory[]> {
  const limited = keys.slice(0, HISTORY_KEYS_MAXIMUM);
  if (limited.length === 0) return [];
  const rows: unknown = await database.execute(
    sql`SELECT DISTINCT ON (r.strategy_version_id, r.symbol, r.timeframe)
        r.strategy_version_id::text AS strategy_version_id, r.symbol, r.timeframe, r.kind,
        r.metrics->'totalReturn'->>'value' AS total_return,
        r.metrics->'period'->>'elapsedMilliseconds' AS elapsed
      FROM runs r
      WHERE r.user_id = ${scope.ownerUserId} AND r.deleted_at IS NULL AND r.status = ${RUN_STATUS.COMPLETED}
        AND r.kind IN (${RUN_KIND.BACKTEST}, ${RUN_KIND.WALK_FORWARD}) AND r.metrics IS NOT NULL
        AND ${keyCondition(limited)}
      ORDER BY r.strategy_version_id, r.symbol, r.timeframe, r.finished_at DESC NULLS LAST`,
  );
  const list = Array.isArray(rows) ? (rows as readonly RawRow[]) : [];
  return list.map(toHistory).filter((history): history is NoticeHistory => history !== undefined);
}
