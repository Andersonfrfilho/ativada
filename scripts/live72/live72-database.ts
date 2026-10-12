// Copyright (c) 2026 Ada Technology. All rights reserved.
import { z } from '../../packages/environment/src/index.js';
import { runCountsSchema, type RunCounts } from './run-counts.js';

const countsRowSchema = z.object({
  signals: z.number().int(),
  orders: z.number().int(),
  fills: z.number().int(),
  positions: z.number().int(),
  equity_points: z.number().int(),
  alerts: z.number().int(),
  last_candle_time: z.string().nullable(),
});

export function openLive72Sql(databaseUrl: string): Bun.SQL {
  return new Bun.SQL(databaseUrl, { max: 2, connectionTimeout: 5 });
}

export async function readRunCounts(sql: Bun.SQL, runId: string): Promise<RunCounts> {
  const rows: unknown = await sql`
    SELECT
      (SELECT count(*) FROM signals WHERE run_id = ${runId})::int AS signals,
      (SELECT count(*) FROM orders WHERE run_id = ${runId})::int AS orders,
      (SELECT count(*) FROM fills WHERE run_id = ${runId})::int AS fills,
      (SELECT count(*) FROM positions WHERE run_id = ${runId})::int AS positions,
      (SELECT count(*) FROM equity_points WHERE run_id = ${runId})::int AS equity_points,
      (SELECT count(*) FROM alerts WHERE run_id = ${runId})::int AS alerts,
      (SELECT max(candle_time) FROM equity_points WHERE run_id = ${runId})::text AS last_candle_time`;
  const row = countsRowSchema.parse(Array.isArray(rows) ? rows[0] : undefined);
  return runCountsSchema.parse({
    signals: row.signals,
    orders: row.orders,
    fills: row.fills,
    positions: row.positions,
    equityPoints: row.equity_points,
    alerts: row.alerts,
    lastCandleTime: row.last_candle_time === null ? null : Number(row.last_candle_time),
  });
}

const duplicateRowSchema = z.object({
  signals: z.number().int(),
  orders: z.number().int(),
  fills: z.number().int(),
  equity_points: z.number().int(),
  alerts: z.number().int(),
});

// Cada subconsulta devolve quantos grupos de chave têm mais de uma linha: o esperado é zero em todas.
export async function readDuplicateCounts(
  sql: Bun.SQL,
  runId: string,
): Promise<z.infer<typeof duplicateRowSchema>> {
  const rows: unknown = await sql`
    SELECT
      (SELECT count(*) FROM (SELECT 1 FROM signals WHERE run_id = ${runId}
        GROUP BY candle_time HAVING count(*) > 1) grouped)::int AS signals,
      ((SELECT count(*) FROM (SELECT 1 FROM orders WHERE run_id = ${runId}
        GROUP BY engine_key HAVING count(*) > 1) grouped)
       + (SELECT count(*) FROM (SELECT 1 FROM orders WHERE run_id = ${runId}
        GROUP BY created_candle_time, purpose, side, type HAVING count(*) > 1) grouped))::int AS orders,
      ((SELECT count(*) FROM (SELECT 1 FROM fills WHERE run_id = ${runId}
        GROUP BY order_key, candle_time HAVING count(*) > 1) grouped)
       + (SELECT count(*) FROM (SELECT 1 FROM fills WHERE run_id = ${runId}
        GROUP BY position_key, side, candle_time HAVING count(*) > 1) grouped))::int AS fills,
      (SELECT count(*) FROM (SELECT 1 FROM equity_points WHERE run_id = ${runId}
        GROUP BY candle_time HAVING count(*) > 1) grouped)::int AS equity_points,
      (SELECT count(*) FROM (SELECT 1 FROM alerts WHERE run_id = ${runId}
        GROUP BY candle_time, side, channel HAVING count(*) > 1) grouped)::int AS alerts`;
  return duplicateRowSchema.parse(Array.isArray(rows) ? rows[0] : undefined);
}
