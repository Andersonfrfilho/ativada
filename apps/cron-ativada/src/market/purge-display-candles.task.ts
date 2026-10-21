// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { CandleRepository } from '@ativada/database';
import { isDisplayTimeframe, type DisplayRetentionDays } from '@ativada/market-data-crypto';

import { MILLISECONDS_PER_DAY } from './market.constant.js';

export type PurgeDisplayCandlesDependencies = {
  readonly repository: Pick<CandleRepository, 'purgeDisplayCandles'>;
  readonly retentionDays: DisplayRetentionDays;
  readonly now: () => number;
};

export type PurgeDisplayCandlesSummary = {
  readonly deleted: number;
  readonly failures: number;
};

export type PurgeDisplayCandlesTask = () => Promise<PurgeDisplayCandlesSummary>;

// Só velas de exibição vencidas, cada uma pela sua retenção; velas de execução (15m ou maior) nunca entram (a guarda mora no repositório).
export function createPurgeDisplayCandlesTask(
  dependencies: PurgeDisplayCandlesDependencies,
): PurgeDisplayCandlesTask {
  return async () => {
    const now = dependencies.now();
    let deleted = 0;
    for (const [timeframe, days] of Object.entries(dependencies.retentionDays)) {
      if (!isDisplayTimeframe(timeframe)) continue;
      deleted += await dependencies.repository.purgeDisplayCandles({
        openedBefore: now - days * MILLISECONDS_PER_DAY,
        timeframes: [timeframe],
      });
    }
    return { deleted, failures: 0 };
  };
}
