// Copyright (c) 2026 Ada Technology. All rights reserved.
// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { CandleRepository } from '@cryptoada/database';
import {
  createCancellableSleep,
  createKlineStream,
  type CancellableSleep,
  type KlineStream,
  type MarketDataClient,
  type ServerClock,
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
import { createCandleWriter, type CandleWriter } from './candle-writer.js';
import { recoverGaps } from './gap-recovery.js';
import { createRecoveryRunner, type RecoveryRunner } from './recovery-runner.js';
import type { RecoveryClock } from './recovery-clock.js';

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
  readonly abortController: AbortController;
  // Aberturas que a Binance não tem: a recuperação as preenche e a simulação ao vivo as lê como lacuna confirmada.
  readonly unfillable?: Set<string> | undefined;
  // Chamado depois de cada candle fechado gravado: acorda a avaliação das simulações ao vivo.
  readonly onCandleStored?: (() => void) | undefined;
  // Cada recuperação de lacunas que termina sem erro é anotada: a simulação ao vivo conta com elas para confirmar um buraco.
  readonly recoveryClock?: Pick<RecoveryClock, 'markCleanRound'> | undefined;
  readonly serverClock?: Pick<ServerClock, 'now' | 'refresh'> | undefined;
  readonly timing?: WorkerTiming;
};

export type Worker = { readonly stop: () => Promise<void> };

function shouldLogMalformed(count: number): boolean {
  return count <= MALFORMED_LOG_ALWAYS_UNTIL || count % MALFORMED_LOG_EVERY === 0;
}

type ResolvedTiming = {
  readonly now: () => number;
  readonly marketNow: () => number;
  readonly refreshClock: () => Promise<void>;
  readonly sleep: (milliseconds: number) => Promise<void>;
  readonly random: () => number;
  readonly backoffBase: number;
  readonly backoffMax: number;
  readonly gapCheckIntervalMilliseconds: number;
  readonly lookbackMilliseconds: number;
};

function resolveTiming(
  dependencies: WorkerDependencies,
  cancellable: CancellableSleep,
): ResolvedTiming {
  const timing = dependencies.timing ?? {};
  const now = timing.now ?? Date.now;
  return {
    now,
    marketNow: dependencies.serverClock?.now ?? now,
    refreshClock: dependencies.serverClock?.refresh ?? ((): Promise<void> => Promise.resolve()),
    sleep: timing.sleep ?? cancellable.sleep,
    random: timing.random ?? Math.random,
    backoffBase: timing.backoffBaseMilliseconds ?? DEFAULT_BACKOFF_BASE_MILLISECONDS,
    backoffMax: timing.backoffMaxMilliseconds ?? DEFAULT_BACKOFF_MAX_MILLISECONDS,
    gapCheckIntervalMilliseconds:
      timing.gapCheckIntervalMilliseconds ??
      (dependencies.gapCheckMinutes ?? DEFAULT_STREAM_GAP_CHECK_MINUTES) * MILLISECONDS_PER_MINUTE,
    lookbackMilliseconds:
      (dependencies.gapLookbackHours ?? DEFAULT_STREAM_GAP_LOOKBACK_HOURS) * MILLISECONDS_PER_HOUR,
  };
}

function createRecovery(dependencies: WorkerDependencies, timing: ResolvedTiming): RecoveryRunner {
  const unfillable = dependencies.unfillable ?? new Set<string>();
  return createRecoveryRunner({
    recover: async () => {
      const outcome = await recoverGaps({
        ...dependencies,
        now: timing.marketNow,
        refreshClock: timing.refreshClock,
        lookbackMilliseconds: timing.lookbackMilliseconds,
        unfillable,
        signal: dependencies.abortController.signal,
      });
      if (outcome.failures === 0 && !dependencies.abortController.signal.aborted) {
        dependencies.recoveryClock?.markCleanRound();
      }
      return outcome;
    },
    logger: dependencies.logger,
    sleep: timing.sleep,
    random: timing.random,
    backoffBaseMilliseconds: timing.backoffBase,
    backoffMaxMilliseconds: timing.backoffMax,
  });
}

type WorkerStreamParams = {
  readonly dependencies: WorkerDependencies;
  readonly timing: ResolvedTiming;
  readonly recovery: RecoveryRunner;
  readonly writer: CandleWriter;
};

function createWorkerStream(params: WorkerStreamParams): KlineStream {
  const { dependencies, timing, recovery, writer } = params;
  const { logger } = dependencies;
  return createKlineStream({
    symbols: dependencies.symbols,
    timeframes: dependencies.timeframes,
    baseUrl: dependencies.streamBaseUrl,
    staleAfterMilliseconds: dependencies.staleAfterMilliseconds,
    reconnectBaseMilliseconds: timing.backoffBase,
    reconnectMaxMilliseconds: timing.backoffMax,
    stableAfterMilliseconds: dependencies.timing?.stableAfterMilliseconds,
    now: timing.now,
    sleep: timing.sleep,
    random: timing.random,
    onCandle: async (candle) => {
      await writer.write(candle);
      dependencies.onCandleStored?.();
    },
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
}

export function createWorker(dependencies: WorkerDependencies): Worker {
  const { logger, abortController } = dependencies;
  const cancellable = createCancellableSleep();
  const timing = resolveTiming(dependencies, cancellable);
  const recovery = createRecovery(dependencies, timing);
  const writer = createCandleWriter({
    repository: dependencies.repository,
    logger,
    exchange: dependencies.exchange,
    sleep: timing.sleep,
    onWriteExhausted: recovery.trigger,
    signal: abortController.signal,
  });
  const stream = createWorkerStream({ dependencies, timing, recovery, writer });

  // Verificação barata (SQL): só vai ao REST se achar lacuna na janela de retrocesso.
  const periodicCheck = setInterval(() => {
    logger.info(WORKER_LOG.STREAM_STATS, { ...stream.stats() });
    recovery.trigger();
  }, timing.gapCheckIntervalMilliseconds);

  return {
    stop: async (): Promise<void> => {
      abortController.abort();
      clearInterval(periodicCheck);
      await stream.close();
      await recovery.stop();
      cancellable.cancelAll();
      await writer.drain();
    },
  };
}
