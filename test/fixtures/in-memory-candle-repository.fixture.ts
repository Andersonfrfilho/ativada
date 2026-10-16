// Copyright (c) 2026 Ada Technology. All rights reserved.
import {
  CLOCK_SKEW_TOLERANCE_MILLISECONDS,
  OpenCandleRejectedError,
  type CandleRecord,
  type CandleRepository,
  type StoredCandleTimeframe,
  type UpsertCandlesResult,
} from '../../packages/database/src/index.js';
import { MARKET_CANDLE_DURATION_MILLISECONDS } from '../../packages/market-data-crypto/src/index.js';

export type InMemoryCandleRepository = Pick<
  CandleRepository,
  'findMissingOpenTimes' | 'upsertCandles' | 'findLatestOpenTime'
> & {
  readonly stored: () => readonly StoredRecord[];
  readonly upsertSizes: number[];
};

type StoredRecord = CandleRecord<StoredCandleTimeframe>;

function storageKey(candle: Pick<StoredRecord, 'symbol' | 'timeframe' | 'openTime'>): string {
  return `${candle.symbol}|${candle.timeframe}|${candle.openTime}`;
}

// Espelha as regras do repositório real: candle aberto é rejeitado e o fechado é imutável.
export function createInMemoryCandleRepository(options: {
  readonly now: () => number;
  readonly seed?: readonly StoredRecord[];
}): InMemoryCandleRepository {
  const rows = new Map<string, StoredRecord>();
  for (const candle of options.seed ?? []) rows.set(storageKey(candle), candle);
  const upsertSizes: number[] = [];
  return {
    upsertSizes,
    stored: (): readonly StoredRecord[] => [...rows.values()],
    upsertCandles: (candles): Promise<UpsertCandlesResult> => {
      upsertSizes.push(candles.length);
      const openCandle = candles.find(
        (candle) => candle.closeTime > options.now() + CLOCK_SKEW_TOLERANCE_MILLISECONDS,
      );
      if (openCandle !== undefined)
        return Promise.reject(new OpenCandleRejectedError(openCandle.openTime));
      let inserted = 0;
      for (const candle of candles) {
        if (rows.has(storageKey(candle))) continue;
        rows.set(storageKey(candle), candle);
        inserted += 1;
      }
      return Promise.resolve({ inserted });
    },
    findLatestOpenTime: (key): Promise<number | undefined> => {
      const openTimes = [...rows.values()]
        .filter((candle) => candle.symbol === key.symbol && candle.timeframe === key.timeframe)
        .map((candle) => candle.openTime);
      return Promise.resolve(openTimes.length === 0 ? undefined : Math.max(...openTimes));
    },
    findMissingOpenTimes: (params): Promise<readonly number[]> => {
      const duration = MARKET_CANDLE_DURATION_MILLISECONDS[params.timeframe];
      const missing: number[] = [];
      for (
        let open = Math.ceil(params.from / duration) * duration;
        open < params.to;
        open += duration
      ) {
        const key = storageKey({
          symbol: params.symbol,
          timeframe: params.timeframe,
          openTime: open,
        });
        if (!rows.has(key)) missing.push(open);
      }
      return Promise.resolve(missing);
    },
  };
}
