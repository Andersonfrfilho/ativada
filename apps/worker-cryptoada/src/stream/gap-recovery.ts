// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { CandleRepository } from '@cryptoada/database';
import { MILLISECONDS_PER_SECOND, readErrorName } from '@cryptoada/environment';
import {
  downloadCandleInterval,
  formatPairLabel,
  groupConsecutiveOpenTimes,
  MarketDataBannedError,
  TIMEFRAME_DURATION_MILLISECONDS,
  type MarketDataClient,
  type OpenTimeInterval,
  type PairKey,
  type Timeframe,
} from '@cryptoada/market-data';

import type { WorkerLogger } from '../logging/worker-logger.js';
import {
  DEFAULT_BAN_SECONDS,
  MAXIMUM_BAN_SECONDS,
  UNFILLABLE_MIN_AGE_MILLISECONDS,
  WORKER_LOG,
} from '../worker.constant.js';

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
  readonly signal: AbortSignal;
};

export type RecoveryOutcome = {
  readonly failures: number;
  // Presente quando a exchange baniu o IP: nenhuma chamada nova antes disto passar.
  readonly banMilliseconds?: number;
};

function buildUnfillableKey(pair: PairKey, openTime: number): string {
  return `${formatPairLabel(pair)}/${openTime}`;
}

async function downloadInterval(
  dependencies: GapRecoveryDependencies,
  pair: PairKey,
  interval: OpenTimeInterval,
): Promise<number> {
  const { receivedOpenTimes: received } = await downloadCandleInterval({
    client: dependencies.client,
    pair,
    interval,
    exchange: dependencies.exchange,
    store: (records) => dependencies.repository.upsertCandles(records),
  });
  const duration = TIMEFRAME_DURATION_MILLISECONDS[pair.timeframe];
  const now = dependencies.now();
  for (let openTime = interval.from; openTime <= interval.to; openTime += duration) {
    const isOldEnough = now - (openTime + duration) >= UNFILLABLE_MIN_AGE_MILLISECONDS;
    if (!received.has(openTime) && isOldEnough) {
      dependencies.unfillable.add(buildUnfillableKey(pair, openTime));
    }
  }
  return received.size;
}

async function findMissing(
  dependencies: GapRecoveryDependencies,
  pair: PairKey,
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

async function recoverPair(dependencies: GapRecoveryDependencies, pair: PairKey): Promise<void> {
  const latestOpenTime = await dependencies.repository.findLatestOpenTime({
    exchange: dependencies.exchange,
    ...pair,
  });
  if (latestOpenTime === undefined) {
    dependencies.logger.info(WORKER_LOG.NO_STORED_CANDLES, {
      pairId: formatPairLabel(pair),
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
      pairId: formatPairLabel(pair),
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
      if (dependencies.signal.aborted) return { failures };
      try {
        await recoverPair(dependencies, { symbol, timeframe });
      } catch (error: unknown) {
        if (dependencies.signal.aborted) return { failures };
        failures += 1;
        dependencies.logger.error(WORKER_LOG.GAP_RECOVERY_FAILED, {
          pairId: formatPairLabel({ symbol, timeframe }),
          errorName: readErrorName(error),
        });
        if (error instanceof MarketDataBannedError) {
          return { failures, banMilliseconds: computeBanMilliseconds(error) };
        }
      }
    }
  }
  return { failures };
}
