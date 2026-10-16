// Copyright (c) 2026 Ada Technology. All rights reserved.
import { and, asc, desc, eq, gte, inArray, lt, sql } from 'drizzle-orm';

import type { BunSQLDatabase } from 'drizzle-orm/bun-sql';

import { readOpenDatabase, type DatabaseHandle } from '../database-handle.js';
import { candles } from '../schema/candles.schema.js';
import {
  CANDLE_INSERT_BATCH_SIZE,
  CLOCK_SKEW_TOLERANCE_MILLISECONDS,
  DISPLAY_CANDLE_PURGE_BATCH_SIZE,
  DISPLAY_CANDLE_TIMEFRAMES,
  CANDLE_TIMEFRAME_DURATION_MILLISECONDS,
} from './candle.constant.js';
import type {
  CandleRecord,
  CandleRepository,
  CandleRepositoryOptions,
  CandleSeriesKey,
  FindCandlesParams,
  FindMissingOpenTimesParams,
  PurgeDisplayCandlesParams,
  StoredCandleTimeframe,
  UpsertCandlesResult,
} from './candle.types.js';
import { OpenCandleRejectedError } from './open-candle-rejected.error.js';

const NO_ROW_LIMIT = Number.MAX_SAFE_INTEGER;

function matchesSeries(key: CandleSeriesKey<StoredCandleTimeframe>): ReturnType<typeof and> {
  return and(
    eq(candles.exchange, key.exchange),
    eq(candles.symbol, key.symbol),
    eq(candles.timeframe, key.timeframe),
  );
}

type StoredRecord = CandleRecord<StoredCandleTimeframe>;

function splitIntoBatches(records: readonly StoredRecord[]): readonly (readonly StoredRecord[])[] {
  const batches: (readonly StoredRecord[])[] = [];
  for (let start = 0; start < records.length; start += CANDLE_INSERT_BATCH_SIZE) {
    batches.push(records.slice(start, start + CANDLE_INSERT_BATCH_SIZE));
  }
  return batches;
}

type ExpectedOpenTimeRow = { readonly openTime: string | number | bigint };

async function selectMissingOpenTimes(
  database: BunSQLDatabase,
  params: FindMissingOpenTimesParams<StoredCandleTimeframe>,
): Promise<readonly number[]> {
  const duration = CANDLE_TIMEFRAME_DURATION_MILLISECONDS[params.timeframe];
  const firstGridOpenTime = Math.ceil(params.from / duration) * duration;
  if (firstGridOpenTime >= params.to) return [];
  const rows = await database.execute<ExpectedOpenTimeRow>(sql`
    SELECT expected.open_time AS "openTime"
    FROM generate_series(${firstGridOpenTime}::bigint, ${params.to - 1}::bigint, ${duration}::bigint)
      AS expected(open_time)
    WHERE NOT EXISTS (
      SELECT 1 FROM candles
      WHERE candles.exchange = ${params.exchange}
        AND candles.symbol = ${params.symbol}
        AND candles.timeframe = ${params.timeframe}
        AND candles.open_time = expected.open_time
    )
    ORDER BY expected.open_time`);
  return rows.map((row) => Number(row.openTime));
}

type UpsertContext = { readonly database: BunSQLDatabase; readonly now: () => number };

// Não atualiza (candle fechado é imutável): DO NOTHING mantém o gravado e `inserted` conta só as novas.
async function upsertCandles(
  context: UpsertContext,
  records: readonly StoredRecord[],
): Promise<UpsertCandlesResult> {
  const latestAcceptableCloseTime = context.now() + CLOCK_SKEW_TOLERANCE_MILLISECONDS;
  const openCandle = records.find((record) => record.closeTime > latestAcceptableCloseTime);
  if (openCandle !== undefined) throw new OpenCandleRejectedError(openCandle.openTime);
  let inserted = 0;
  for (const batch of splitIntoBatches(records)) {
    const rows = await context.database
      .insert(candles)
      .values([...batch])
      .onConflictDoNothing()
      .returning({ openTime: candles.openTime });
    inserted += rows.length;
  }
  return { inserted };
}

async function findCandles<TTimeframe extends StoredCandleTimeframe>(
  database: BunSQLDatabase,
  params: FindCandlesParams<TTimeframe>,
): Promise<readonly CandleRecord<TTimeframe>[]> {
  const rows = await database
    .select()
    .from(candles)
    .where(
      and(
        matchesSeries(params),
        gte(candles.openTime, params.from),
        lt(candles.openTime, params.to),
      ),
    )
    .orderBy(asc(candles.openTime))
    .limit(params.limit ?? NO_ROW_LIMIT);
  return rows.map((row) => ({
    exchange: row.exchange,
    symbol: row.symbol,
    timeframe: params.timeframe,
    openTime: row.openTime,
    closeTime: row.closeTime,
    open: row.open,
    high: row.high,
    low: row.low,
    close: row.close,
    volume: row.volume,
    tradeCount: row.tradeCount,
  }));
}

async function findLatestOpenTime(
  database: BunSQLDatabase,
  key: CandleSeriesKey<StoredCandleTimeframe>,
): Promise<number | undefined> {
  const [latest] = await database
    .select({ openTime: candles.openTime })
    .from(candles)
    .where(matchesSeries(key))
    .orderBy(desc(candles.openTime))
    .limit(1);
  return latest?.openTime;
}

// Em lotes, só as velas de exibição (nunca 15m, 1h, 4h, 1d) abertas antes do corte; o corte é exclusivo.
async function purgeDisplayCandles(
  database: BunSQLDatabase,
  params: PurgeDisplayCandlesParams,
): Promise<number> {
  const batchSize = params.batchSize ?? DISPLAY_CANDLE_PURGE_BATCH_SIZE;
  let total = 0;
  for (;;) {
    const deleted = await database.execute(sql`
      DELETE FROM candles WHERE ctid IN (
        SELECT ctid FROM candles
        WHERE ${inArray(candles.timeframe, [...DISPLAY_CANDLE_TIMEFRAMES])}
          AND ${candles.openTime} < ${params.openedBefore}
        LIMIT ${batchSize})
      RETURNING 1`);
    total += deleted.length;
    if (deleted.length < batchSize) return total;
  }
}

export function createCandleRepository(
  handle: DatabaseHandle,
  options: CandleRepositoryOptions = {},
): CandleRepository {
  const { database } = readOpenDatabase(handle);
  const context: UpsertContext = { database, now: options.now ?? Date.now };
  return {
    upsertCandles: (records) => upsertCandles(context, records),
    findCandles: (params) => findCandles(database, params),
    findMissingOpenTimes: (params) => selectMissingOpenTimes(database, params),
    findLatestOpenTime: (key) => findLatestOpenTime(database, key),
    purgeDisplayCandles: (params) => purgeDisplayCandles(database, params),
  };
}
