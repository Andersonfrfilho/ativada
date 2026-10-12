// Copyright (c) 2026 Ada Technology. All rights reserved.
import { z } from '../../packages/environment/src/index.js';
import { readRunCounts } from './live72-database.js';
import type { RunFile } from './run-file.js';
import type { StatusFacts } from './status-format.js';

type DatabaseStatus = Pick<
  StatusFacts,
  | 'runStatus'
  | 'isWaitingForData'
  | 'counts'
  | 'evaluatedCandles'
  | 'equity'
  | 'openPosition'
  | 'alertsByStatus'
  | 'databaseBytes'
>;

const runRowSchema = z.object({ status: z.string(), is_waiting: z.boolean() });
const evaluatedRowSchema = z.object({ evaluated: z.number().int(), equity: z.string().nullable() });
const positionRowSchema = z.object({ entry_price: z.string(), quantity: z.string() });
const alertRowSchema = z.object({ status: z.string(), total: z.number().int() });
const sizeRowSchema = z.object({ bytes: z.string() });

function firstRow(rows: unknown): unknown {
  return Array.isArray(rows) ? rows[0] : undefined;
}

async function readAlertsByStatus(sql: Bun.SQL, runId: string): Promise<Record<string, number>> {
  const rows: unknown = await sql`
    SELECT status, count(*)::int AS total FROM alerts WHERE run_id = ${runId} GROUP BY status`;
  const totals: Record<string, number> = {};
  for (const row of Array.isArray(rows) ? rows : []) {
    const parsed = alertRowSchema.parse(row);
    totals[parsed.status] = parsed.total;
  }
  return totals;
}

async function readOpenPosition(sql: Bun.SQL, runId: string): Promise<string | null> {
  const rows: unknown = await sql`
    SELECT entry_price::text AS entry_price, quantity::text AS quantity
    FROM positions WHERE run_id = ${runId} AND status = 'open' LIMIT 1`;
  const row = firstRow(rows);
  if (row === undefined) return null;
  const parsed = positionRowSchema.parse(row);
  return `aberta, ${parsed.quantity} a ${parsed.entry_price}`;
}

export async function readDatabaseStatus(sql: Bun.SQL, run: RunFile): Promise<DatabaseStatus> {
  const runRows: unknown = await sql`
    SELECT status, (waiting_since IS NOT NULL) AS is_waiting FROM runs WHERE id = ${run.runId}`;
  const runRow = runRowSchema.parse(firstRow(runRows));
  const evaluatedRows: unknown = await sql`
    SELECT count(*)::int AS evaluated,
      (SELECT equity::text FROM equity_points WHERE run_id = ${run.runId}
        ORDER BY candle_time DESC LIMIT 1) AS equity
    FROM equity_points WHERE run_id = ${run.runId} AND candle_time >= ${run.periodStart}`;
  const evaluated = evaluatedRowSchema.parse(firstRow(evaluatedRows));
  const sizeRows: unknown = await sql`SELECT pg_database_size(current_database())::text AS bytes`;
  return {
    runStatus: runRow.status,
    isWaitingForData: runRow.is_waiting,
    counts: await readRunCounts(sql, run.runId),
    evaluatedCandles: evaluated.evaluated,
    equity: evaluated.equity,
    openPosition: await readOpenPosition(sql, run.runId),
    alertsByStatus: await readAlertsByStatus(sql, run.runId),
    databaseBytes: Number(sizeRowSchema.parse(firstRow(sizeRows)).bytes),
  };
}

export const EMPTY_DATABASE_STATUS: DatabaseStatus = {
  runStatus: null,
  isWaitingForData: false,
  counts: null,
  evaluatedCandles: null,
  equity: null,
  openPosition: null,
  alertsByStatus: {},
  databaseBytes: null,
};
