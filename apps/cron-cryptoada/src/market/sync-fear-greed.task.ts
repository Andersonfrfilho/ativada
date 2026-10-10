// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { SentimentRepository } from '@cryptoada/database';
import type { FearGreedClient } from '@cryptoada/market-data';

import type { CronLogger } from '../logging/cron-logger.js';
import { FEAR_GREED_FULL_HISTORY_LIMIT } from './market.constant.js';

export type SyncFearGreedDependencies = {
  readonly repository: Pick<SentimentRepository, 'findLatestDate' | 'upsertFearGreed'>;
  readonly client: FearGreedClient;
  readonly logger: CronLogger;
  readonly refreshDays: number;
};

export type SyncFearGreedSummary = {
  readonly fullHistory: number;
  readonly fetched: number;
  readonly upserted: number;
  readonly failures: number;
};

export type SyncFearGreedTask = () => Promise<SyncFearGreedSummary>;

export function createSyncFearGreedTask(
  dependencies: SyncFearGreedDependencies,
): SyncFearGreedTask {
  const { repository, client, logger, refreshDays } = dependencies;
  return async () => {
    const isEmpty = (await repository.findLatestDate()) === undefined;
    const limit = isEmpty ? FEAR_GREED_FULL_HISTORY_LIMIT : refreshDays;
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
      failures: 0,
    };
  };
}
