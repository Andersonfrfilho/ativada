// Copyright (c) 2026 Ada Technology. All rights reserved.
import { sql } from 'drizzle-orm';

import type { DatabaseExecutor } from '../database-executor.js';
import type { OwnerScope } from '../ownership/owner-scope.js';
import type { DecisionMarket } from './run-live-status.types.js';

// Sem nenhuma vela fechada desde o início, mínima e máxima não existem: `null`, nunca zero.
export type PriceRangeRow = {
  readonly low: string | null;
  readonly high: string | null;
  readonly from: number;
};

export type RunPriceRange = {
  // O período da meta desta simulação.
  readonly period: PriceRangeRow;
  // Toda a sequência de renovações (`request.renewedFrom`), da primeira simulação até agora.
  readonly total: PriceRangeRow;
  readonly periods: number;
};

const CHAIN_MAXIMUM = 1000;

function readText(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function readCount(value: unknown): number {
  return typeof value === 'number' || typeof value === 'string' ? Number(value) : 0;
}

function toRange(rows: unknown): RunPriceRange | undefined {
  if (!Array.isArray(rows)) return undefined;
  const row: unknown = rows[0];
  if (typeof row !== 'object' || row === null) return undefined;
  const read = (key: string): unknown => Object.getOwnPropertyDescriptor(row, key)?.value;
  return {
    period: {
      low: readText(read('period_low')),
      high: readText(read('period_high')),
      from: readCount(read('period_from')),
    },
    total: {
      low: readText(read('total_low')),
      high: readText(read('total_high')),
      from: readCount(read('total_from')),
    },
    periods: readCount(read('periods')),
  };
}

// Mínima e máxima do preço da moeda nas velas FECHADAS que a simulação já viu, do início do período e do início da sequência
// renovada. A cadeia segue `renewedFrom` só entre execuções do mesmo dono; as velas vêm pela PK de candles.
export async function readRunPriceRange(
  executor: DatabaseExecutor,
  scope: OwnerScope,
  params: { readonly runId: string; readonly market: DecisionMarket },
): Promise<RunPriceRange | undefined> {
  const { exchange, symbol, timeframe } = params.market;
  const rows: unknown = await executor.execute(sql`
    WITH RECURSIVE chain AS (
      SELECT r.id, r.user_id, r.period_start, r.request, r.last_candle_time, 1 AS depth
      FROM runs r WHERE r.id = ${params.runId}::uuid AND r.user_id = ${scope.ownerUserId}::uuid
      UNION ALL
      SELECT p.id, p.user_id, p.period_start, p.request, p.last_candle_time, c.depth + 1
      FROM chain c JOIN runs p ON p.user_id = c.user_id AND p.id::text = c.request->>'renewedFrom'
      WHERE c.depth < ${CHAIN_MAXIMUM}
    ), bounds AS (
      SELECT (SELECT period_start FROM chain WHERE depth = 1) AS period_from,
        min(period_start) AS total_from,
        (SELECT last_candle_time FROM chain WHERE depth = 1) AS until,
        count(*) AS periods
      FROM chain
    )
    SELECT b.period_from, b.total_from, b.periods,
      (SELECT min(low)::text FROM candles WHERE exchange = ${exchange} AND symbol = ${symbol} AND timeframe = ${timeframe}
        AND open_time >= b.period_from AND open_time <= b.until) AS period_low,
      (SELECT max(high)::text FROM candles WHERE exchange = ${exchange} AND symbol = ${symbol} AND timeframe = ${timeframe}
        AND open_time >= b.period_from AND open_time <= b.until) AS period_high,
      (SELECT min(low)::text FROM candles WHERE exchange = ${exchange} AND symbol = ${symbol} AND timeframe = ${timeframe}
        AND open_time >= b.total_from AND open_time <= b.until) AS total_low,
      (SELECT max(high)::text FROM candles WHERE exchange = ${exchange} AND symbol = ${symbol} AND timeframe = ${timeframe}
        AND open_time >= b.total_from AND open_time <= b.until) AS total_high
    FROM bounds b WHERE b.periods > 0`);
  return toRange(rows);
}
