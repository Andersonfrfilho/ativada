// Copyright (c) 2026 Ada Technology. All rights reserved.
import { z } from '../../packages/environment/src/index.js';
import { CANDLE_MILLISECONDS, SIGNAL_ACTION_HOLD } from './live72.constant.js';
import { readDuplicateCounts, readRunCounts } from './live72-database.js';
import type { AlertSample, DatabaseFacts } from './report-types.js';
import type { RunFile } from './run-file.js';
import type { SeriesPoint } from './series-stats.js';

const SAMPLE_LIMIT = 5;

const runRowSchema = z.object({
  status: z.string(),
  error_code: z.string().nullable(),
  goal_outcome: z.string().nullable(),
  finished_ms: z.string().nullable(),
  is_waiting: z.boolean(),
});

const seriesRowSchema = z.object({
  candle_time: z.string(),
  equity: z.string(),
  equity_at_low: z.string(),
  benchmark: z.string(),
});

const alertStatusRowSchema = z.object({ status: z.string(), total: z.number().int() });

const alertSampleRowSchema = z.object({
  candle_time: z.string(),
  side: z.string(),
  status: z.string(),
  symbol: z.string().nullable(),
  close_price: z.string().nullable(),
  score: z.string().nullable(),
  simulated_action: z.string().nullable(),
});

const totalRowSchema = z.object({ total: z.number().int() });

function asRows(rows: unknown): unknown[] {
  return Array.isArray(rows) ? rows : [];
}

async function readSeries(sql: Bun.SQL, runId: string): Promise<SeriesPoint[]> {
  const rows: unknown = await sql`
    SELECT candle_time::text AS candle_time, equity::text AS equity,
      equity_at_low::text AS equity_at_low, benchmark::text AS benchmark
    FROM equity_points WHERE run_id = ${runId} ORDER BY candle_time`;
  return asRows(rows).map((row) => {
    const parsed = seriesRowSchema.parse(row);
    return {
      candleTime: Number(parsed.candle_time),
      equity: parsed.equity,
      equityAtLow: parsed.equity_at_low,
      benchmark: parsed.benchmark,
    };
  });
}

async function readAlerts(
  sql: Bun.SQL,
  runId: string,
): Promise<Pick<DatabaseFacts, 'alertsByStatus' | 'alertSample'>> {
  const statusRows: unknown = await sql`
    SELECT status, count(*)::int AS total FROM alerts WHERE run_id = ${runId} GROUP BY status`;
  const sampleRows: unknown = await sql`
    SELECT candle_time::text AS candle_time, side, status,
      payload->>'symbol' AS symbol, payload->>'closePrice' AS close_price,
      payload->>'score' AS score, payload->>'simulatedAction' AS simulated_action
    FROM alerts WHERE run_id = ${runId} ORDER BY candle_time LIMIT ${SAMPLE_LIMIT}`;
  const alertsByStatus: Record<string, number> = {};
  for (const row of asRows(statusRows)) {
    const parsed = alertStatusRowSchema.parse(row);
    alertsByStatus[parsed.status] = parsed.total;
  }
  const alertSample: AlertSample[] = asRows(sampleRows).map((row) => {
    const parsed = alertSampleRowSchema.parse(row);
    return {
      candleTime: Number(parsed.candle_time),
      side: parsed.side,
      status: parsed.status,
      symbol: parsed.symbol ?? 'n/d',
      closePrice: parsed.close_price ?? 'n/d',
      score: parsed.score ?? 'n/d',
      simulatedAction: parsed.simulated_action ?? 'n/d',
    };
  });
  return { alertsByStatus, alertSample };
}

async function readRunRow(sql: Bun.SQL, runId: string): Promise<z.infer<typeof runRowSchema>> {
  const rows: unknown = await sql`
    SELECT status, error_code, goal_outcome, (extract(epoch from finished_at) * 1000)::bigint::text AS finished_ms,
      (waiting_since IS NOT NULL) AS is_waiting
    FROM runs WHERE id = ${runId}`;
  return runRowSchema.parse(asRows(rows)[0]);
}

async function countActionableSignals(
  sql: Bun.SQL,
  params: { readonly runId: string; readonly fromCandleTime: number },
): Promise<number> {
  const rows: unknown = await sql`
    SELECT count(*)::int AS total FROM signals
    WHERE run_id = ${params.runId} AND action <> ${SIGNAL_ACTION_HOLD}
      AND candle_time >= ${params.fromCandleTime}`;
  return totalRowSchema.parse(asRows(rows)[0]).total;
}

async function countAlerts(
  sql: Bun.SQL,
  params: { readonly runId: string; readonly fromCandleTime: number },
): Promise<number> {
  const rows: unknown = await sql`
    SELECT count(*)::int AS total FROM alerts
    WHERE run_id = ${params.runId} AND candle_time >= ${params.fromCandleTime}`;
  return totalRowSchema.parse(asRows(rows)[0]).total;
}

async function countEvaluatedAfter(
  sql: Bun.SQL,
  params: { readonly runId: string; readonly killMilliseconds: number },
): Promise<number> {
  const closeAfter = params.killMilliseconds - CANDLE_MILLISECONDS;
  const rows: unknown = await sql`
    SELECT count(*)::int AS total FROM equity_points
    WHERE run_id = ${params.runId} AND candle_time > ${closeAfter}`;
  return totalRowSchema.parse(asRows(rows)[0]).total;
}

export async function readDatabaseFacts(
  sql: Bun.SQL,
  params: { readonly run: RunFile; readonly killAt: string | null },
): Promise<DatabaseFacts> {
  const { runId, periodStart: fromCandleTime } = params.run;
  const run = await readRunRow(sql, runId);
  const duplicates = await readDuplicateCounts(sql, runId);
  return {
    runStatus: run.status,
    runErrorCode: run.error_code,
    goalOutcome: run.goal_outcome,
    finishedAt: run.finished_ms === null ? null : new Date(Number(run.finished_ms)).toISOString(),
    isWaitingForData: run.is_waiting,
    counts: await readRunCounts(sql, runId),
    actionableSignals: await countActionableSignals(sql, { runId, fromCandleTime: 0 }),
    windowActionableSignals: await countActionableSignals(sql, { runId, fromCandleTime }),
    windowAlerts: await countAlerts(sql, { runId, fromCandleTime }),
    duplicates: {
      signals: duplicates.signals,
      orders: duplicates.orders,
      fills: duplicates.fills,
      equityPoints: duplicates.equity_points,
      alerts: duplicates.alerts,
    },
    series: await readSeries(sql, runId),
    evaluatedAfterKill:
      params.killAt === null
        ? null
        : await countEvaluatedAfter(sql, {
            runId,
            killMilliseconds: Date.parse(params.killAt),
          }),
    ...(await readAlerts(sql, runId)),
  };
}
