// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { CandleRepository } from '@cryptoada/database';
import {
  TIMEFRAME_DURATION_MILLISECONDS,
  type MarketDataClient,
  type Timeframe,
} from '@cryptoada/market-data';

import type { CronLogger } from '../logging/cron-logger.js';
import { computeBackfillWindow } from './backfill-window.js';
import {
  groupConsecutiveOpenTimes,
  type OpenTimeInterval,
} from './group-consecutive-open-times.js';
import { BACKFILL_LOG } from './market.constant.js';

export type BackfillPairDependencies = {
  readonly repository: Pick<CandleRepository, 'findMissingOpenTimes' | 'upsertCandles'>;
  readonly client: Pick<MarketDataClient, 'fetchKlinesRange'>;
  readonly logger: CronLogger;
  readonly now: () => number;
  readonly refreshClock: () => Promise<void>;
  readonly exchange: string;
  readonly years: number;
};

export type BackfillPair = {
  readonly symbol: string;
  readonly timeframe: Timeframe;
};

export type BackfillPairResult = {
  readonly inserted: number;
  readonly unfillable: number;
};

async function findGaps(
  dependencies: BackfillPairDependencies,
  pair: BackfillPair,
): Promise<readonly OpenTimeInterval[]> {
  const window = computeBackfillWindow({
    now: dependencies.now(),
    years: dependencies.years,
    timeframe: pair.timeframe,
  });
  const openTimes = await dependencies.repository.findMissingOpenTimes({
    exchange: dependencies.exchange,
    symbol: pair.symbol,
    timeframe: pair.timeframe,
    from: window.from,
    to: window.to,
  });
  return groupConsecutiveOpenTimes({
    openTimes,
    durationMilliseconds: TIMEFRAME_DURATION_MILLISECONDS[pair.timeframe],
  });
}

// Cada página é gravada ao chegar: se o processo morrer, a próxima execução só vê o que falta.
async function downloadGap(
  dependencies: BackfillPairDependencies,
  pair: BackfillPair,
  gap: OpenTimeInterval,
): Promise<number> {
  let inserted = 0;
  await dependencies.client.fetchKlinesRange({
    symbol: pair.symbol,
    timeframe: pair.timeframe,
    from: gap.from,
    to: gap.to,
    onPage: async (page) => {
      const result = await dependencies.repository.upsertCandles(
        page.map((candle) => ({ ...candle, exchange: dependencies.exchange })),
      );
      inserted += result.inserted;
    },
  });
  return inserted;
}

function reportUnfillable(
  dependencies: BackfillPairDependencies,
  pair: BackfillPair,
  gaps: readonly OpenTimeInterval[],
): void {
  for (const gap of gaps) {
    dependencies.logger.info(BACKFILL_LOG.UNFILLABLE, {
      gapId: `${pair.symbol}/${pair.timeframe}/${gap.from}-${gap.to}`,
    });
  }
}

export async function backfillPair(
  dependencies: BackfillPairDependencies,
  pair: BackfillPair,
): Promise<BackfillPairResult> {
  const gaps = await findGaps(dependencies, pair);
  if (gaps.length === 0) return { inserted: 0, unfillable: 0 };
  let inserted = 0;
  for (const gap of gaps) inserted += await downloadGap(dependencies, pair, gap);
  const remaining = await findGaps(dependencies, pair);
  reportUnfillable(dependencies, pair, remaining);
  return { inserted, unfillable: remaining.length };
}
