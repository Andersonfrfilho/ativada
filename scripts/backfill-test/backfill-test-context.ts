// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { CandleRecord, CandleRepository } from '../../packages/database/src/index.js';
import { assertCondition } from '../identity-test/identity-test.error.js';
import {
  DURATION_MILLISECONDS,
  EXCHANGE,
  type BackfillTimeframe,
} from './backfill-test.constant.js';
import type { FakeBinanceServer } from './fake-binance-server.js';
import { runBackfill, type BackfillRun } from './run-backfill.js';

export type BackfillContext = {
  readonly databaseUrl: string;
  readonly sql: Bun.SQL;
  readonly repository: CandleRepository;
  readonly server: FakeBinanceServer;
};

type CountRow = { readonly total: number };

export function reportCheck(message: string): void {
  console.log(`backfill-test: ${message}`);
}

export async function countCandles(
  context: BackfillContext,
  series: { readonly symbol: string; readonly timeframe: BackfillTimeframe },
): Promise<number> {
  const rows: unknown = await context.sql`
    SELECT count(*)::int AS total FROM candles
    WHERE symbol = ${series.symbol} AND timeframe = ${series.timeframe}`;
  return (rows as readonly CountRow[])[0]?.total ?? 0;
}

export async function seedGrid(
  context: BackfillContext,
  params: {
    readonly symbol: string;
    readonly timeframe: BackfillTimeframe;
    readonly from: number;
    readonly to: number;
    readonly skippedOpenTimes: ReadonlySet<number>;
  },
): Promise<number> {
  const duration = DURATION_MILLISECONDS[params.timeframe];
  const records: CandleRecord[] = [];
  for (let openTime = params.from; openTime < params.to; openTime += duration) {
    if (params.skippedOpenTimes.has(openTime)) continue;
    records.push({
      exchange: EXCHANGE,
      symbol: params.symbol,
      timeframe: params.timeframe,
      openTime,
      closeTime: openTime + duration - 1,
      open: '1.00000000',
      high: '1.00000000',
      low: '1.00000000',
      close: '1.00000000',
      volume: '1.00000000',
      tradeCount: 1,
    });
  }
  return (await context.repository.upsertCandles(records)).inserted;
}

export function readCount(run: BackfillRun, field: string): number {
  const value = run.summary[field];
  assertCondition(typeof value === 'number', `o resumo do cron não traz ${field}: ${run.output}`);
  return value;
}

export async function runForContext(
  context: BackfillContext,
  params: {
    readonly symbols: readonly string[];
    readonly timeframes: readonly BackfillTimeframe[];
    readonly years: number;
  },
): Promise<BackfillRun> {
  return runBackfill({
    databaseUrl: context.databaseUrl,
    baseUrl: context.server.baseUrl,
    ...params,
  });
}
