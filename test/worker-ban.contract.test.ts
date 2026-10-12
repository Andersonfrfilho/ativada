// Copyright (c) 2026 Ada Technology. All rights reserved.
import { afterEach, describe, expect, test } from 'bun:test';

import { createWorkerLogger } from '../apps/worker-ativada/src/logging/worker-logger.js';
import { recoverGaps } from '../apps/worker-ativada/src/stream/gap-recovery.js';
import { WORKER_LOG } from '../apps/worker-ativada/src/worker.constant.js';
import { MarketDataBannedError } from '../packages/market-data-crypto/src/index.js';
import { buildGridCandle } from './fixtures/backfill-harness.fixture.js';
import { createInMemoryCandleRepository } from './fixtures/in-memory-candle-repository.fixture.js';
import {
  PIPELINE_BASE,
  PIPELINE_HOUR,
  startPipeline,
  stopPipeline,
  type Pipeline,
} from './fixtures/worker-pipeline.fixture.js';
import { waitFor } from './fixtures/wait-for.fixture.js';

const RETRY_AFTER_SECONDS = 90;
const SYMBOLS = ['BTCUSDT', 'ETHUSDT'] as const;

let pipeline: Pipeline;

afterEach(async () => {
  await stopPipeline(pipeline);
});

function publishHistory(): void {
  const openTimes = [-3, -2, -1].map((hours) => PIPELINE_BASE + hours * PIPELINE_HOUR);
  for (const symbol of SYMBOLS) {
    pipeline.server.setHistory({ symbol, timeframe: '1h', openTimes });
  }
}

describe('worker: a 418 during the gap recovery', () => {
  test('stops the pairs that follow and sleeps Retry-After in slices before any new REST call', async () => {
    pipeline = startPipeline({
      symbols: [...SYMBOLS],
      seedOpenTime: PIPELINE_BASE - 3 * PIPELINE_HOUR,
    });
    pipeline.server.banRest({ requests: 1, retryAfterSeconds: RETRY_AFTER_SECONDS });
    publishHistory();
    await waitFor(() => pipeline.finishedRecoveries() === 1, 'recovery finished after the ban');
    expect(pipeline.delays).toStrictEqual([30_000, 30_000, 30_000]);
    expect(pipeline.restRequestsAtSleep).toStrictEqual([1, 1, 1]);
    expect(pipeline.server.restRequests.map((request) => request.symbol)).toStrictEqual([
      'BTCUSDT',
      'BTCUSDT',
      'ETHUSDT',
    ]);
    expect(pipeline.logs(WORKER_LOG.GAP_RECOVERY_BANNED)).toHaveLength(1);
    expect(pipeline.server.connectionCount()).toBe(1);
  });

  test('a ban without Retry-After sleeps the default of two minutes', async () => {
    pipeline = startPipeline({
      symbols: [...SYMBOLS],
      seedOpenTime: PIPELINE_BASE - 3 * PIPELINE_HOUR,
    });
    pipeline.server.banRest({ requests: 1 });
    publishHistory();
    await waitFor(() => pipeline.finishedRecoveries() === 1, 'recovery finished after the ban');
    expect(pipeline.delays.reduce((total, delay) => total + delay, 0)).toBe(120_000);
  });

  test('a periodic check that fires while the ban lasts does not reach the API', async () => {
    pipeline = startPipeline({
      symbols: [...SYMBOLS],
      seedOpenTime: PIPELINE_BASE - 3 * PIPELINE_HOUR,
      gapCheckIntervalMilliseconds: 5,
    });
    pipeline.server.banRest({ requests: 1, retryAfterSeconds: RETRY_AFTER_SECONDS });
    publishHistory();
    await waitFor(() => pipeline.finishedRecoveries() >= 1, 'recovery finished after the ban');
    expect(pipeline.restRequestsAtSleep.every((count) => count === 1)).toBe(true);
  });
});

describe('worker: the ban sleep has a ceiling', () => {
  test.each([
    ['a Retry-After of ten days', 864_000, 86_400_000],
    ['a Retry-After of 45 s', 45, 45_000],
    ['no Retry-After', undefined, 120_000],
  ] as const)('%s', async (_name, retryAfterSeconds, expectedMilliseconds) => {
    const now = PIPELINE_BASE + PIPELINE_HOUR / 2;
    const outcome = await recoverGaps({
      repository: createInMemoryCandleRepository({
        now: () => now,
        seed: [
          buildGridCandle({
            symbol: 'BTCUSDT',
            timeframe: '1h',
            openTime: PIPELINE_BASE - 3 * PIPELINE_HOUR,
          }),
        ],
      }),
      client: {
        fetchKlinesRange: () =>
          Promise.reject(new MarketDataBannedError(retryAfterSeconds, 'Binance')),
      },
      logger: createWorkerLogger({ appName: 'worker-ativada', write: () => undefined }),
      now: () => now,
      refreshClock: () => Promise.resolve(),
      exchange: 'binance',
      symbols: ['BTCUSDT'],
      timeframes: ['1h'],
      lookbackMilliseconds: 4 * PIPELINE_HOUR,
      unfillable: new Set<string>(),
      signal: new AbortController().signal,
    });
    expect(outcome).toStrictEqual({ failures: 1, banMilliseconds: expectedMilliseconds });
  });
});
