// Copyright (c) 2026 Ada Technology. All rights reserved.
import {
  OpenCandleRejectedError,
  type CandleRecord,
  type CandleRepository,
  type UpsertCandlesResult,
} from '../../packages/database/src/index.js';
import { TIMEFRAME_DURATION_MILLISECONDS } from '../../packages/market-data/src/index.js';

export type InMemoryCandleRepository = Pick<
  CandleRepository,
  'findMissingOpenTimes' | 'upsertCandles'
> & {
  readonly stored: () => readonly CandleRecord[];
  readonly upsertSizes: number[];
};

function storageKey(candle: Pick<CandleRecord, 'symbol' | 'timeframe' | 'openTime'>): string {
  return `${candle.symbol}|${candle.timeframe}|${candle.openTime}`;
}

// Espelha as regras do repositório real: candle aberto é rejeitado e o fechado é imutável.
export function createInMemoryCandleRepository(options: {
  readonly now: () => number;
  readonly seed?: readonly CandleRecord[];
}): InMemoryCandleRepository {
  const rows = new Map<string, CandleRecord>();
  for (const candle of options.seed ?? []) rows.set(storageKey(candle), candle);
  const upsertSizes: number[] = [];
  return {
    upsertSizes,
    stored: (): readonly CandleRecord[] => [...rows.values()],
    upsertCandles: (candles): Promise<UpsertCandlesResult> => {
      upsertSizes.push(candles.length);
      const openCandle = candles.find((candle) => candle.closeTime >= options.now());
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
    findMissingOpenTimes: (params): Promise<readonly number[]> => {
      const duration = TIMEFRAME_DURATION_MILLISECONDS[params.timeframe];
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
