// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { CandleRepository } from '@cryptoada/database';
import { readErrorName } from '@cryptoada/environment';
import { formatPairLabel, type Candle } from '@cryptoada/market-data';

import type { WorkerLogger } from '../logging/worker-logger.js';
import {
  CANDLE_WRITE_MAX_ATTEMPTS,
  CANDLE_WRITE_RETRY_BASE_MILLISECONDS,
  WORKER_LOG,
} from '../worker.constant.js';

export type CandleWriterDependencies = {
  readonly repository: Pick<CandleRepository, 'upsertCandles'>;
  readonly logger: WorkerLogger;
  readonly exchange: string;
  readonly sleep: (milliseconds: number) => Promise<void>;
  readonly onWriteExhausted: () => void;
  readonly signal: AbortSignal;
};

export type CandleWriter = {
  readonly write: (candle: Candle) => Promise<void>;
  readonly drain: () => Promise<void>;
};

export function buildCandleId(candle: Pick<Candle, 'symbol' | 'timeframe' | 'openTime'>): string {
  return `${formatPairLabel(candle)}/${candle.openTime}`;
}

function sleepUnlessAborted(
  dependencies: CandleWriterDependencies,
  milliseconds: number,
): Promise<void> {
  const { signal } = dependencies;
  if (signal.aborted) return Promise.resolve();
  return new Promise((resolve) => {
    signal.addEventListener('abort', () => resolve(), { once: true });
    void dependencies.sleep(milliseconds).then(resolve);
  });
}

async function writeWithRetries(
  dependencies: CandleWriterDependencies,
  candle: Candle,
): Promise<void> {
  const candleId = buildCandleId(candle);
  for (let attempt = 1; ; attempt += 1) {
    try {
      const result = await dependencies.repository.upsertCandles([
        { ...candle, exchange: dependencies.exchange },
      ]);
      dependencies.logger.info(WORKER_LOG.CANDLE_STORED, { candleId, inserted: result.inserted });
      return;
    } catch (error: unknown) {
      if (attempt >= CANDLE_WRITE_MAX_ATTEMPTS) {
        dependencies.logger.error(WORKER_LOG.CANDLE_WRITE_FAILED, {
          candleId,
          attempts: attempt,
          errorName: readErrorName(error),
        });
        dependencies.onWriteExhausted();
        return;
      }
      dependencies.logger.warn(WORKER_LOG.CANDLE_WRITE_RETRY, {
        candleId,
        attempt,
        errorName: readErrorName(error),
      });
      await sleepUnlessAborted(
        dependencies,
        CANDLE_WRITE_RETRY_BASE_MILLISECONDS * 2 ** (attempt - 1),
      );
      // Parando, a vela fica para a recuperação por janela da próxima partida.
      if (dependencies.signal.aborted) return;
    }
  }
}

export function createCandleWriter(dependencies: CandleWriterDependencies): CandleWriter {
  const inFlight = new Set<Promise<void>>();
  return {
    write: (candle): Promise<void> => {
      const pending = writeWithRetries(dependencies, candle);
      inFlight.add(pending);
      void pending.finally(() => inFlight.delete(pending));
      return pending;
    },
    drain: async (): Promise<void> => {
      await Promise.all([...inFlight]);
    },
  };
}
