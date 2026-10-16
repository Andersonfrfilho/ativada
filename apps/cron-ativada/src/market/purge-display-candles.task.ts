// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { CandleRepository } from '@ativada/database';

import { MILLISECONDS_PER_DAY } from './market.constant.js';

export type PurgeDisplayCandlesDependencies = {
  readonly repository: Pick<CandleRepository, 'purgeDisplayCandles'>;
  readonly retentionDays: number;
  readonly now: () => number;
};

export type PurgeDisplayCandlesSummary = {
  readonly deleted: number;
  readonly failures: number;
};

export type PurgeDisplayCandlesTask = () => Promise<PurgeDisplayCandlesSummary>;

// Só velas de exibição vencidas; velas de execução (15m ou maior) nunca entram (a guarda mora no repositório).
export function createPurgeDisplayCandlesTask(
  dependencies: PurgeDisplayCandlesDependencies,
): PurgeDisplayCandlesTask {
  return async () => {
    const openedBefore = dependencies.now() - dependencies.retentionDays * MILLISECONDS_PER_DAY;
    const deleted = await dependencies.repository.purgeDisplayCandles({ openedBefore });
    return { deleted, failures: 0 };
  };
}
