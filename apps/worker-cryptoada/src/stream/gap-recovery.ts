// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { CandleRepository } from '@cryptoada/database';
import { MILLISECONDS_PER_SECOND } from '@cryptoada/environment';
import {
  MarketDataBannedError,
  TIMEFRAME_DURATION_MILLISECONDS,
  type MarketDataClient,
  type Timeframe,
} from '@cryptoada/market-data';

import type { WorkerLogger } from '../logging/worker-logger.js';
import { DEFAULT_BAN_SECONDS, MAXIMUM_BAN_SECONDS, WORKER_LOG } from '../worker.constant.js';
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
  readonly refreshClock: () => Promise<void>;
  readonly exchange: string;
  readonly symbols: readonly string[];
  readonly timeframes: readonly Timeframe[];
  readonly lookbackMilliseconds: number;
  // Aberturas que a Binance não tem: perguntar de novo a cada verificação só gastaria peso.
  readonly unfillable: Set<string>;
};

export type RecoveryOutcome = {
  readonly failures: number;
  // Presente quando a exchange baniu o IP: nenhuma chamada nova antes disto passar.
  readonly banMilliseconds?: number;
};

type Pair = { readonly symbol: string; readonly timeframe: Timeframe };

function buildUnfillableKey(pair: Pair, openTime: number): string {
  return `${pair.symbol}/${pair.timeframe}/${openTime}`;
}

async function downloadInterval(
  dependencies: GapRecoveryDependencies,
  pair: Pair,
  interval: OpenTimeInterval,
): Promise<number> {
  const received = new Set<number>();
  await dependencies.client.fetchKlinesRange({
    symbol: pair.symbol,
    timeframe: pair.timeframe,
    from: interval.from,
    to: interval.to,
    onPage: async (page) => {
      await dependencies.repository.upsertCandles(
        page.map((candle) => ({ ...candle, exchange: dependencies.exchange })),
      );
      for (const candle of page) received.add(candle.openTime);
    },
  });
  const duration = TIMEFRAME_DURATION_MILLISECONDS[pair.timeframe];
  for (let openTime = interval.from; openTime <= interval.to; openTime += duration) {
    if (!received.has(openTime)) dependencies.unfillable.add(buildUnfillableKey(pair, openTime));
  }
  return received.size;
}

async function findMissing(
  dependencies: GapRecoveryDependencies,
  pair: Pair,
): Promise<readonly number[]> {
  const duration = TIMEFRAME_DURATION_MILLISECONDS[pair.timeframe];
  const now = dependencies.now();
  const openTimes = await dependencies.repository.findMissingOpenTimes({
    exchange: dependencies.exchange,
    ...pair,
    from: now - dependencies.lookbackMilliseconds,
    to: Math.floor(now / duration) * duration,
  });
  return openTimes.filter(
    (openTime) => !dependencies.unfillable.has(buildUnfillableKey(pair, openTime)),
  );
}

async function recoverPair(dependencies: GapRecoveryDependencies, pair: Pair): Promise<void> {
  const latestOpenTime = await dependencies.repository.findLatestOpenTime({
    exchange: dependencies.exchange,
    ...pair,
  });
  if (latestOpenTime === undefined) {
    dependencies.logger.info(WORKER_LOG.NO_STORED_CANDLES, {
      pairId: `${pair.symbol}/${pair.timeframe}`,
    });
    return;
  }
  const openTimes = await findMissing(dependencies, pair);
  let downloaded = 0;
  const durationMilliseconds = TIMEFRAME_DURATION_MILLISECONDS[pair.timeframe];
  for (const interval of groupConsecutiveOpenTimes({ openTimes, durationMilliseconds })) {
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

function computeBanMilliseconds(error: MarketDataBannedError): number {
  const seconds = Math.min(error.retryAfterSeconds ?? DEFAULT_BAN_SECONDS, MAXIMUM_BAN_SECONDS);
  return seconds * MILLISECONDS_PER_SECOND;
}

export async function recoverGaps(dependencies: GapRecoveryDependencies): Promise<RecoveryOutcome> {
  await dependencies.refreshClock();
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
        if (error instanceof MarketDataBannedError) {
          return { failures, banMilliseconds: computeBanMilliseconds(error) };
        }
      }
    }
  }
  return { failures };
}
