// Copyright (c) 2026 Ada Technology. All rights reserved.
// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { CandleRepository } from '@cryptoada/database';
import {
  createCancellableSleep,
  createKlineStream,
  type MarketDataClient,
  type Timeframe,
} from '@cryptoada/market-data';

import type { WorkerLogger } from '../logging/worker-logger.js';
import {
  DEFAULT_STREAM_GAP_CHECK_MINUTES,
  DEFAULT_STREAM_GAP_LOOKBACK_HOURS,
  MALFORMED_LOG_ALWAYS_UNTIL,
  MALFORMED_LOG_EVERY,
  MILLISECONDS_PER_HOUR,
  MILLISECONDS_PER_MINUTE,
  WORKER_LOG,
} from '../worker.constant.js';
import { createCandleWriter } from './candle-writer.js';
import { recoverGaps } from './gap-recovery.js';
import { createRecoveryRunner } from './recovery-runner.js';

const DEFAULT_BACKOFF_BASE_MILLISECONDS = 2_000;
const DEFAULT_BACKOFF_MAX_MILLISECONDS = 60_000;

export type WorkerTiming = {
  readonly now?: (() => number) | undefined;
  readonly sleep?: ((milliseconds: number) => Promise<void>) | undefined;
  readonly random?: (() => number) | undefined;
  readonly backoffBaseMilliseconds?: number | undefined;
  readonly backoffMaxMilliseconds?: number | undefined;
  readonly stableAfterMilliseconds?: number | undefined;
  readonly gapCheckIntervalMilliseconds?: number | undefined;
};

export type WorkerDependencies = {
  readonly exchange: string;
  readonly symbols: readonly string[];
  readonly timeframes: readonly Timeframe[];
  readonly repository: Pick<
    CandleRepository,
    'findLatestOpenTime' | 'findMissingOpenTimes' | 'upsertCandles'
  >;
  readonly client: Pick<MarketDataClient, 'fetchKlinesRange'>;
  readonly logger: WorkerLogger;
  readonly streamBaseUrl: string;
  readonly staleAfterMilliseconds: number;
  readonly gapLookbackHours?: number | undefined;
  readonly gapCheckMinutes?: number | undefined;
  readonly timing?: WorkerTiming;
};

export type Worker = { readonly stop: () => Promise<void> };

function shouldLogMalformed(count: number): boolean {
  return count <= MALFORMED_LOG_ALWAYS_UNTIL || count % MALFORMED_LOG_EVERY === 0;
}

export function createWorker(dependencies: WorkerDependencies): Worker {
  const { logger, timing = {} } = dependencies;
  const cancellable = createCancellableSleep();
  const sleep = timing.sleep ?? cancellable.sleep;
  const random = timing.random ?? Math.random;
  const backoffBase = timing.backoffBaseMilliseconds ?? DEFAULT_BACKOFF_BASE_MILLISECONDS;
  const backoffMax = timing.backoffMaxMilliseconds ?? DEFAULT_BACKOFF_MAX_MILLISECONDS;
  const now = timing.now ?? Date.now;
  const gapCheckIntervalMilliseconds =
    timing.gapCheckIntervalMilliseconds ??
    (dependencies.gapCheckMinutes ?? DEFAULT_STREAM_GAP_CHECK_MINUTES) * MILLISECONDS_PER_MINUTE;
  const lookbackMilliseconds =
    (dependencies.gapLookbackHours ?? DEFAULT_STREAM_GAP_LOOKBACK_HOURS) * MILLISECONDS_PER_HOUR;
  const unfillable = new Set<string>();
  const recovery = createRecoveryRunner({
    recover: () => recoverGaps({ ...dependencies, now, lookbackMilliseconds, unfillable }),
    logger,
    sleep,
    random,
    backoffBaseMilliseconds: backoffBase,
    backoffMaxMilliseconds: backoffMax,
  });
  const writer = createCandleWriter({
    repository: dependencies.repository,
    logger,
    exchange: dependencies.exchange,
    sleep,
    onWriteExhausted: recovery.trigger,
  });
  // Verificação barata (SQL): só vai ao REST se achar lacuna na janela de retrocesso.
  const periodicCheck = setInterval(recovery.trigger, gapCheckIntervalMilliseconds);
  const stream = createKlineStream({
    symbols: dependencies.symbols,
    timeframes: dependencies.timeframes,
    baseUrl: dependencies.streamBaseUrl,
    staleAfterMilliseconds: dependencies.staleAfterMilliseconds,
    reconnectBaseMilliseconds: backoffBase,
    reconnectMaxMilliseconds: backoffMax,
    stableAfterMilliseconds: timing.stableAfterMilliseconds,
    now,
    sleep,
    random,
    onCandle: writer.write,
    // O fluxo não é confiável antes da lacuna fechada: cada (re)conexão dispara a recuperação.
    onConnected: ({ attempt }) => {
      logger.info(WORKER_LOG.STREAM_CONNECTED, { attempt });
      recovery.trigger();
    },
    onDisconnected: ({ reason }) => logger.warn(WORKER_LOG.STREAM_DISCONNECTED, { reason }),
    onMalformed: ({ reason, count }) => {
      if (shouldLogMalformed(count)) logger.warn(WORKER_LOG.MALFORMED, { reason, count });
    },
  });

  return {
    stop: async (): Promise<void> => {
      clearInterval(periodicCheck);
      await stream.close();
      await recovery.stop();
      cancellable.cancelAll();
      await writer.drain();
    },
  };
}
