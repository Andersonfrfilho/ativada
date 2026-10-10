// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { CandleRepository } from '@cryptoada/database';
import type { Candle } from '@cryptoada/market-data';

import type { WorkerLogger } from '../logging/worker-logger.js';
import { WORKER_LOG } from '../worker.constant.js';

export type CandleWriterDependencies = {
  readonly repository: Pick<CandleRepository, 'upsertCandles'>;
  readonly logger: WorkerLogger;
  readonly exchange: string;
};

export type CandleWriter = {
  readonly write: (candle: Candle) => Promise<void>;
  readonly drain: () => Promise<void>;
};

export function buildCandleId(candle: Pick<Candle, 'symbol' | 'timeframe' | 'openTime'>): string {
  return `${candle.symbol}/${candle.timeframe}/${candle.openTime}`;
}

export function createCandleWriter(dependencies: CandleWriterDependencies): CandleWriter {
  const inFlight = new Set<Promise<void>>();

  // Falha de gravação é registrada com id opaco e nunca sobe: o stream segue vivo.
  async function writeOne(candle: Candle): Promise<void> {
    const candleId = buildCandleId(candle);
    try {
      const result = await dependencies.repository.upsertCandles([
        { ...candle, exchange: dependencies.exchange },
      ]);
      dependencies.logger.info(WORKER_LOG.CANDLE_STORED, { candleId, inserted: result.inserted });
    } catch (error: unknown) {
      dependencies.logger.error(WORKER_LOG.CANDLE_WRITE_FAILED, {
        candleId,
        errorName: error instanceof Error ? error.name : 'UnknownError',
      });
    }
  }

  return {
    write: (candle): Promise<void> => {
      const pending = writeOne(candle);
      inFlight.add(pending);
      void pending.finally(() => inFlight.delete(pending));
      return pending;
    },
    drain: async (): Promise<void> => {
      await Promise.all([...inFlight]);
    },
  };
}
