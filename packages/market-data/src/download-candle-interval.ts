// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { Candle } from './candle.types.js';
import type { OpenTimeInterval } from './group-consecutive-open-times.js';
import type { PairKey } from './format-pair-label.js';
import type { MarketDataClient } from './market-data.types.js';

export type StoredCandle = Candle & { readonly exchange: string };

export type DownloadCandleIntervalParams = {
  readonly client: Pick<MarketDataClient, 'fetchKlinesRange'>;
  readonly pair: PairKey;
  readonly interval: OpenTimeInterval;
  readonly exchange: string;
  readonly store: (records: readonly StoredCandle[]) => Promise<{ readonly inserted: number }>;
};

export type DownloadCandleIntervalResult = {
  readonly inserted: number;
  readonly receivedOpenTimes: ReadonlySet<number>;
};

// Cada página é gravada ao chegar: se o processo morrer, a próxima execução só vê o que falta.
export async function downloadCandleInterval(
  params: DownloadCandleIntervalParams,
): Promise<DownloadCandleIntervalResult> {
  const receivedOpenTimes = new Set<number>();
  let inserted = 0;
  await params.client.fetchKlinesRange({
    symbol: params.pair.symbol,
    timeframe: params.pair.timeframe,
    from: params.interval.from,
    to: params.interval.to,
    onPage: async (page) => {
      const result = await params.store(
        page.map((candle) => ({ ...candle, exchange: params.exchange })),
      );
      inserted += result.inserted;
      for (const candle of page) receivedOpenTimes.add(candle.openTime);
    },
  });
  return { inserted, receivedOpenTimes };
}
