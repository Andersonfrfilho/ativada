// Copyright (c) 2026 Ada Technology. All rights reserved.
import { sql } from 'drizzle-orm';

import type { DatabaseExecutor } from '../database-executor.js';
import type { OwnerScope } from '../ownership/owner-scope.js';
import { readSqlRows, toSegmentsJson, type SqlRow } from './run-projection-sql.js';
import type {
  ListProjectionItemsParams,
  ProjectionItemPage,
  ProjectionItemRow,
} from './run-projections.types.js';

const PROJECTION_ITEMS_MAXIMUM = 100;

export type ListProjectionItemsRequest = {
  readonly executor: DatabaseExecutor;
  readonly scope: OwnerScope;
  readonly runId: string;
  readonly params: ListProjectionItemsParams;
};

function readText(row: SqlRow, key: string): string {
  const value = row[key];
  if (typeof value !== 'string') throw new Error('Linha de previsão gravada incompleta.');
  return value;
}

function readOptionalText(row: SqlRow, key: string): string | null {
  const value = row[key];
  return typeof value === 'string' ? value : null;
}

// Decisão sem a vela dela é estado impossível (a decisão nasce de uma vela gravada): vira 500, nunca linha omitida.
function toSqlRow(row: SqlRow): ProjectionItemRow {
  return {
    candleTime: Number(readText(row, 'candle_time')),
    score: readText(row, 'score'),
    close: readText(row, 'close'),
    atr: readOptionalText(row, 'atr'),
    nextClose: readOptionalText(row, 'next_close'),
    buy: readText(row, 'buy'),
    sell: readText(row, 'sell'),
  };
}

// As previsões da execução, da mais recente para a mais antiga (ADR 0002, spec 009, P7): só as velas dos trechos de limiar
// (no walk-forward, as janelas de teste que terminaram bem), cada uma com o fechamento dela e o da vela seguinte contígua,
// ambos por igualdade na PK de `candles`. Lê uma linha a mais para saber se há página seguinte.
export async function listProjectionItems(
  request: ListProjectionItemsRequest,
): Promise<ProjectionItemPage> {
  const { executor, scope, runId, params } = request;
  if (params.segments.length === 0) return { items: [], nextBefore: undefined };
  const { market } = params;
  const limit = Math.min(Math.max(Math.trunc(params.limit), 1), PROJECTION_ITEMS_MAXIMUM);
  const segments = toSegmentsJson(params.segments);
  const before = params.before ?? Number.MAX_SAFE_INTEGER;
  const rows: unknown = await executor.execute(sql`
    SELECT s.candle_time::text AS candle_time, s.score::text AS score,
      s.indicators->>'risk:atr' AS atr, base.close::text AS close, next.close::text AS next_close,
      w.buy::text AS buy, w.sell::text AS sell
    FROM jsonb_to_recordset(${segments}::text::jsonb)
      AS w(start_time bigint, end_time bigint, buy numeric, sell numeric)
    JOIN signals s ON s.user_id = ${scope.ownerUserId} AND s.run_id = ${runId}
      AND s.candle_time >= w.start_time AND s.candle_time < w.end_time AND s.candle_time < ${before}::bigint
    LEFT JOIN candles base ON base.exchange = ${market.exchange} AND base.symbol = ${market.symbol}
      AND base.timeframe = ${market.timeframe} AND base.open_time = s.candle_time
    LEFT JOIN candles next ON next.exchange = ${market.exchange} AND next.symbol = ${market.symbol}
      AND next.timeframe = ${market.timeframe}
      AND next.open_time = s.candle_time + ${params.durationMilliseconds}::bigint
      AND next.open_time < ${params.rangeEnd}::bigint
    ORDER BY s.candle_time DESC
    LIMIT ${limit + 1}`);
  const all = readSqlRows(rows);
  const page = all.slice(0, limit).map(toSqlRow);
  return { items: page, nextBefore: all.length > limit ? page.at(-1)?.candleTime : undefined };
}
