// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { SentimentRepository } from '@cryptoada/database';
import type { FearGreedClient } from '@cryptoada/market-data';

import type { CronLogger } from '../logging/cron-logger.js';
import {
  FEAR_GREED_FULL_HISTORY_LIMIT,
  MILLISECONDS_PER_DAY,
  MISSING_DAYS_MARGIN,
} from './market.constant.js';

export type SyncFearGreedDependencies = {
  readonly repository: Pick<SentimentRepository, 'findLatestDate' | 'upsertFearGreed'>;
  readonly client: FearGreedClient;
  readonly logger: CronLogger;
  readonly refreshDays: number;
  readonly now: () => number;
};

export type SyncFearGreedSummary = {
  readonly fullHistory: number;
  readonly fetched: number;
  readonly upserted: number;
};

export type SyncFearGreedTask = () => Promise<SyncFearGreedSummary>;

// Cron parado por mais que a janela: pedir também os dias sem leitura (+2 cobre o dia da última leitura e o de hoje).
function computeLimit(params: {
  readonly latestDate: string | undefined;
  readonly refreshDays: number;
  readonly now: number;
}): number {
  if (params.latestDate === undefined) return FEAR_GREED_FULL_HISTORY_LIMIT;
  const startOfToday = Math.floor(params.now / MILLISECONDS_PER_DAY) * MILLISECONDS_PER_DAY;
  const daysSinceLatest = Math.floor(
    (startOfToday - Date.parse(params.latestDate)) / MILLISECONDS_PER_DAY,
  );
  return Math.max(params.refreshDays, daysSinceLatest + MISSING_DAYS_MARGIN);
}

export function createSyncFearGreedTask(
  dependencies: SyncFearGreedDependencies,
): SyncFearGreedTask {
  const { repository, client, logger, refreshDays } = dependencies;
  return async () => {
    const latestDate = await repository.findLatestDate();
    const isEmpty = latestDate === undefined;
    const limit = computeLimit({ latestDate, refreshDays, now: dependencies.now() });
    // Falha da fonte propaga antes de qualquer escrita: o que já está gravado nunca muda.
    const points = await client.fetchFearGreed({ limit });
    await repository.upsertFearGreed(
      points.map((point) => ({
        date: point.date,
        fearGreed: point.value,
        classification: point.classification,
      })),
    );
    logger.info('fear greed synced', { limit, fetched: points.length });
    return {
      fullHistory: isEmpty ? 1 : 0,
      fetched: points.length,
      upserted: points.length,
    };
  };
}
