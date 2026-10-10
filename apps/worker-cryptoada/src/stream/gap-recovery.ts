// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { CandleRepository } from '@cryptoada/database';
import {
  TIMEFRAME_DURATION_MILLISECONDS,
  type MarketDataClient,
  type Timeframe,
} from '@cryptoada/market-data';

import type { WorkerLogger } from '../logging/worker-logger.js';
import { WORKER_LOG } from '../worker.constant.js';
import {
  groupConsecutiveOpenTimes,
  type OpenTimeInterval,
} from './group-consecutive-open-times.js';

export type GapRecoveryDependencies = {
  readonly repository: Pick<
    CandleRepository,
    'findLatestOpenTime' | 'findMissingOpenTimes' | 'upsertCandles'
  >;
  readonly client: Pick<MarketDataClient, 'fetchKlinesRange'>;
  readonly logger: WorkerLogger;
  readonly now: () => number;
  readonly exchange: string;
  readonly symbols: readonly string[];
  readonly timeframes: readonly Timeframe[];
};

type Pair = { readonly symbol: string; readonly timeframe: Timeframe };

async function downloadInterval(
  dependencies: GapRecoveryDependencies,
  pair: Pair,
  interval: OpenTimeInterval,
): Promise<number> {
  let downloaded = 0;
  await dependencies.client.fetchKlinesRange({
    symbol: pair.symbol,
    timeframe: pair.timeframe,
    from: interval.from,
    to: interval.to,
    onPage: async (page) => {
      await dependencies.repository.upsertCandles(
        page.map((candle) => ({ ...candle, exchange: dependencies.exchange })),
      );
      downloaded += page.length;
    },
  });
  return downloaded;
}

async function recoverPair(dependencies: GapRecoveryDependencies, pair: Pair): Promise<void> {
  const series = { exchange: dependencies.exchange, ...pair };
  const latestOpenTime = await dependencies.repository.findLatestOpenTime(series);
  if (latestOpenTime === undefined) {
    dependencies.logger.info(WORKER_LOG.NO_STORED_CANDLES, {
      pairId: `${pair.symbol}/${pair.timeframe}`,
    });
    return;
  }
  const duration = TIMEFRAME_DURATION_MILLISECONDS[pair.timeframe];
  // A grade corrente começa na abertura do candle ainda aberto; tudo antes dela já fechou.
  const currentOpenTime = Math.floor(dependencies.now() / duration) * duration;
  const openTimes = await dependencies.repository.findMissingOpenTimes({
    ...series,
    from: latestOpenTime,
    to: currentOpenTime,
  });
  let downloaded = 0;
  for (const interval of groupConsecutiveOpenTimes({ openTimes, durationMilliseconds: duration })) {
    downloaded += await downloadInterval(dependencies, pair, interval);
  }
  if (openTimes.length > 0) {
    dependencies.logger.info(WORKER_LOG.GAP_RECOVERED, {
      pairId: `${pair.symbol}/${pair.timeframe}`,
      missing: openTimes.length,
      downloaded,
    });
  }
}

// Devolve quantos pares falharam; em sequência de propósito, porque o peso por minuto da Binance é um só.
export async function recoverGaps(dependencies: GapRecoveryDependencies): Promise<number> {
  let failures = 0;
  for (const symbol of dependencies.symbols) {
    for (const timeframe of dependencies.timeframes) {
      try {
        await recoverPair(dependencies, { symbol, timeframe });
      } catch (error: unknown) {
        failures += 1;
        dependencies.logger.error(WORKER_LOG.GAP_RECOVERY_FAILED, {
          pairId: `${symbol}/${timeframe}`,
          errorName: error instanceof Error ? error.name : 'UnknownError',
        });
      }
    }
  }
  return failures;
}
