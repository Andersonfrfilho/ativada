// Copyright (c) 2026 Ada Technology. All rights reserved.
import { and, asc, desc, eq, gte, lt } from 'drizzle-orm';

import { readOpenDatabase, type DatabaseHandle } from '../database-handle.js';
import { candles } from '../schema/candles.schema.js';
import { CANDLE_INSERT_BATCH_SIZE } from './candle.constant.js';
import type {
  CandleRecord,
  CandleRepository,
  CandleRepositoryOptions,
  CandleSeriesKey,
  CandleTimeframe,
  UpsertCandlesResult,
} from './candle.types.js';
import { OpenCandleRejectedError } from './open-candle-rejected.error.js';

function matchesSeries(key: CandleSeriesKey): ReturnType<typeof and> {
  return and(
    eq(candles.exchange, key.exchange),
    eq(candles.symbol, key.symbol),
    eq(candles.timeframe, key.timeframe),
  );
}

function splitIntoBatches(records: readonly CandleRecord[]): readonly (readonly CandleRecord[])[] {
  const batches: (readonly CandleRecord[])[] = [];
  for (let start = 0; start < records.length; start += CANDLE_INSERT_BATCH_SIZE) {
    batches.push(records.slice(start, start + CANDLE_INSERT_BATCH_SIZE));
  }
  return batches;
}

// Candle fechado é imutável: DO NOTHING mantém o gravado e `inserted` conta só as linhas novas.
export function createCandleRepository(
  handle: DatabaseHandle,
  options: CandleRepositoryOptions = {},
): CandleRepository {
  const { database } = readOpenDatabase(handle);
  const now = options.now ?? Date.now;
  return {
    upsertCandles: async (records): Promise<UpsertCandlesResult> => {
      const currentTime = now();
      const openCandle = records.find((record) => record.closeTime >= currentTime);
      if (openCandle !== undefined) throw new OpenCandleRejectedError(openCandle.openTime);
      let inserted = 0;
      for (const batch of splitIntoBatches(records)) {
        const rows = await database
          .insert(candles)
          .values([...batch])
          .onConflictDoNothing()
          .returning({ openTime: candles.openTime });
        inserted += rows.length;
      }
      return { inserted };
    },
    findCandles: async (params): Promise<readonly CandleRecord[]> => {
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
        .orderBy(asc(candles.openTime));
      return rows.map((row) => ({
        exchange: row.exchange,
        symbol: row.symbol,
        timeframe: row.timeframe as CandleTimeframe,
        openTime: row.openTime,
        closeTime: row.closeTime,
        open: row.open,
        high: row.high,
        low: row.low,
        close: row.close,
        volume: row.volume,
        tradeCount: row.tradeCount,
      }));
    },
    findLatestOpenTime: async (key): Promise<number | undefined> => {
      const [latest] = await database
        .select({ openTime: candles.openTime })
        .from(candles)
        .where(matchesSeries(key))
        .orderBy(desc(candles.openTime))
        .limit(1);
      return latest?.openTime;
    },
  };
}
