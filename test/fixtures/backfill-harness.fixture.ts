// Copyright (c) 2026 Ada Technology. All rights reserved.
import {
  createBackfillCandlesTask,
  type BackfillCandlesSummary,
} from '../../apps/cron-cryptoada/src/market/backfill-candles.task.js';
import { createCronLogger } from '../../apps/cron-cryptoada/src/logging/cron-logger.js';
import type { CandleRecord, CandleTimeframe } from '../../packages/database/src/index.js';
import {
  createMarketDataClient,
  TIMEFRAME_DURATION_MILLISECONDS,
} from '../../packages/market-data/src/index.js';
import { createFakeClock } from './fake-binance.fixture.js';
import {
  createFakeBinanceGrid,
  type FakeBinanceGrid,
  type WithheldRange,
} from './fake-binance-grid.fixture.js';
import {
  createInMemoryCandleRepository,
  type InMemoryCandleRepository,
} from './in-memory-candle-repository.fixture.js';

export const BACKFILL_NOW = Date.parse('2026-10-09T12:34:56.789Z');
export const BACKFILL_EXCHANGE = 'binance';

export type BackfillHarnessOptions = {
  readonly symbols?: readonly string[];
  readonly timeframes?: readonly CandleTimeframe[];
  readonly years?: number;
  readonly seed?: readonly CandleRecord[];
  readonly withheld?: readonly WithheldRange[];
  readonly delayMilliseconds?: number;
};

export type BackfillHarness = {
  readonly run: () => Promise<BackfillCandlesSummary>;
  readonly repository: InMemoryCandleRepository;
  readonly grid: FakeBinanceGrid;
  readonly lines: string[];
  readonly events: string[];
};

export function buildGridCandle(params: {
  readonly symbol: string;
  readonly timeframe: CandleTimeframe;
  readonly openTime: number;
}): CandleRecord {
  const duration = TIMEFRAME_DURATION_MILLISECONDS[params.timeframe];
  return {
    exchange: BACKFILL_EXCHANGE,
    symbol: params.symbol,
    timeframe: params.timeframe,
    openTime: params.openTime,
    closeTime: params.openTime + duration - 1,
    open: '1.00000000',
    high: '1.00000000',
    low: '1.00000000',
    close: '1.00000000',
    volume: '1.00000000',
    tradeCount: 1,
  };
}

export function createBackfillHarness(options: BackfillHarnessOptions = {}): BackfillHarness {
  const lines: string[] = [];
  const events: string[] = [];
  const repository = createInMemoryCandleRepository({
    now: () => BACKFILL_NOW,
    ...(options.seed === undefined ? {} : { seed: options.seed }),
  });
  const grid = createFakeBinanceGrid({
    now: BACKFILL_NOW,
    ...(options.withheld === undefined ? {} : { withheld: options.withheld }),
    ...(options.delayMilliseconds === undefined
      ? {}
      : { delayMilliseconds: options.delayMilliseconds }),
  });
  const clock = createFakeClock(BACKFILL_NOW);
  const task = createBackfillCandlesTask({
    repository,
    client: createMarketDataClient({
      baseUrl: 'https://market-data.test',
      fetchImplementation: grid.fetchImplementation,
      now: clock.now,
      sleep: clock.sleep,
    }),
    logger: createCronLogger({ appName: 'cron-cryptoada', write: (line) => void lines.push(line) }),
    now: () => BACKFILL_NOW,
    refreshClock: () => {
      events.push(`clock-refresh:${grid.calls.length}`);
      return Promise.resolve();
    },
    exchange: BACKFILL_EXCHANGE,
    symbols: options.symbols ?? ['BTCUSDT'],
    timeframes: options.timeframes ?? ['1h'],
    years: options.years ?? 2,
  });
  return { run: task, repository, grid, lines, events };
}
