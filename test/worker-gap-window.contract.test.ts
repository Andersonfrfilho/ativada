// Copyright (c) 2026 Ada Technology. All rights reserved.
import { afterEach, describe, expect, test } from 'bun:test';

import { createWorkerLogger } from '../apps/worker-cryptoada/src/logging/worker-logger.js';
import { recoverGaps } from '../apps/worker-cryptoada/src/stream/gap-recovery.js';
import { WORKER_LOG } from '../apps/worker-cryptoada/src/worker.constant.js';
import type { Candle } from '../packages/market-data/src/index.js';
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

const PERIODIC_INTERVAL_MILLISECONDS = 30;
const HOURS_PUBLISHED = 24;
const REST_OUTAGE_ATTEMPTS = 100_000;

let pipeline: Pipeline;

afterEach(async () => {
  await stopPipeline(pipeline);
});

function hoursFrom(first: number, count: number): number[] {
  return Array.from({ length: count }, (_unused, index) => first + index * PIPELINE_HOUR);
}

function publishHistory(
  options: { readonly missingOpenTimes?: readonly number[]; readonly firstHoursBack?: number } = {},
): void {
  const missingOpenTimes = options.missingOpenTimes ?? [];
  const firstHoursBack = options.firstHoursBack ?? 12;
  const openTimes = hoursFrom(
    PIPELINE_BASE - firstHoursBack * PIPELINE_HOUR,
    HOURS_PUBLISHED + firstHoursBack - 12,
  ).filter((openTime) => !missingOpenTimes.includes(openTime));
  pipeline.server.setHistory({ symbol: 'BTCUSDT', timeframe: '1h', openTimes });
}

describe('worker: the gap check covers a lookback window, not "from the latest stored"', () => {
  test('a hole BEFORE the latest candle is filled once REST is back', async () => {
    pipeline = startPipeline();
    publishHistory();
    await waitFor(() => pipeline.finishedRecoveries() === 1, 'first recovery finished');
    pipeline.server.failRest(REST_OUTAGE_ATTEMPTS);
    pipeline.clock.advance(3 * PIPELINE_HOUR);
    pipeline.server.dropConnections();
    await waitFor(
      () => pipeline.logs(WORKER_LOG.GAP_RECOVERY_FAILED).length >= 1,
      'recovery failing while REST is down',
    );
    const latest = PIPELINE_BASE + 2 * PIPELINE_HOUR;
    pipeline.server.sendEvent({
      symbol: 'BTCUSDT',
      timeframe: '1h',
      openTime: latest,
      isClosed: true,
    });
    await waitFor(
      () => pipeline.storedOpenTimes('BTCUSDT').includes(latest),
      'stream candle stored',
    );
    pipeline.server.failRest(0);
    await waitFor(() => pipeline.finishedRecoveries() === 2, 'recovery after REST came back');
    expect(pipeline.storedOpenTimes('BTCUSDT')).toStrictEqual(
      hoursFrom(PIPELINE_BASE - PIPELINE_HOUR, 4),
    );
  });

  test('the check starts at now minus the lookback and downloads only what is missing in it', async () => {
    pipeline = startPipeline({ gapLookbackHours: 6, shouldPrefillWindow: false });
    publishHistory();
    await waitFor(() => pipeline.finishedRecoveries() === 1, 'first recovery finished');
    expect(pipeline.server.restRequests).toHaveLength(1);
    expect(pipeline.server.restRequests[0]).toMatchObject({
      startTime: PIPELINE_BASE - 5 * PIPELINE_HOUR,
      endTime: PIPELINE_BASE - 2 * PIPELINE_HOUR,
    });
    expect(pipeline.storedOpenTimes('BTCUSDT')).toStrictEqual(
      hoursFrom(PIPELINE_BASE - 5 * PIPELINE_HOUR, 5),
    );
  });

  test('a candle whose write was lost between two stored ones is recovered', async () => {
    const lost = PIPELINE_BASE - 2 * PIPELINE_HOUR;
    const now = PIPELINE_BASE + PIPELINE_HOUR / 2;
    const repository = createInMemoryCandleRepository({
      now: () => now,
      seed: [lost - PIPELINE_HOUR, lost + PIPELINE_HOUR, lost + 2 * PIPELINE_HOUR].map((openTime) =>
        buildGridCandle({ symbol: 'BTCUSDT', timeframe: '1h', openTime }),
      ),
    });
    const downloaded: number[] = [];
    const outcome = await recoverGaps({
      repository,
      client: {
        fetchKlinesRange: async (params) => {
          downloaded.push(params.from, params.to);
          const page: Candle[] = [
            buildGridCandle({ symbol: 'BTCUSDT', timeframe: '1h', openTime: lost }),
          ];
          await params.onPage?.(page);
          return page;
        },
      },
      logger: createWorkerLogger({ appName: 'worker-cryptoada', write: () => undefined }),
      now: () => now,
      exchange: 'binance',
      symbols: ['BTCUSDT'],
      timeframes: ['1h'],
      refreshClock: () => Promise.resolve(),
      lookbackMilliseconds: 3 * PIPELINE_HOUR,
      unfillable: new Set<string>(),
      signal: new AbortController().signal,
    });
    expect(outcome).toStrictEqual({ failures: 0 });
    expect(downloaded).toStrictEqual([lost, lost]);
    expect(repository.stored().map((candle) => candle.openTime)).toContain(lost);
  });

  test('an old interval Binance does not have is asked once, not at every check', async () => {
    const withheld = [PIPELINE_BASE - 29 * PIPELINE_HOUR, PIPELINE_BASE - 28 * PIPELINE_HOUR];
    pipeline = startPipeline({ gapLookbackHours: 30, shouldPrefillWindow: false });
    publishHistory({ missingOpenTimes: withheld, firstHoursBack: 29 });
    await waitFor(() => pipeline.finishedRecoveries() === 1, 'first recovery finished');
    expect(pipeline.server.restRequests).toHaveLength(1);
    pipeline.server.dropConnections();
    await waitFor(() => pipeline.finishedRecoveries() === 2, 'recovery after the drop');
    expect(pipeline.server.restRequests).toHaveLength(1);
  });

  test('a recent hole is asked again: the REST may just be late', async () => {
    pipeline = startPipeline({ seedOpenTime: PIPELINE_BASE - 3 * PIPELINE_HOUR });
    publishHistory({ missingOpenTimes: [PIPELINE_BASE - 2 * PIPELINE_HOUR] });
    await waitFor(() => pipeline.finishedRecoveries() === 1, 'first recovery finished');
    const requestsAfterFirst = pipeline.server.restRequests.length;
    pipeline.server.dropConnections();
    await waitFor(() => pipeline.finishedRecoveries() === 2, 'recovery after the drop');
    expect(pipeline.server.restRequests.length).toBeGreaterThan(requestsAfterFirst);
  });
});

describe('worker: the gap check uses the server clock', () => {
  test('a local clock ahead of the server does not make the still-open candle look missing', async () => {
    pipeline = startPipeline({ serverClockOffsetMilliseconds: -3_000 });
    publishHistory();
    await waitFor(() => pipeline.finishedRecoveries() === 1, 'first recovery finished');
    pipeline.clock.advance(PIPELINE_HOUR / 2 + 1_000);
    pipeline.server.dropConnections();
    await waitFor(() => pipeline.finishedRecoveries() === 2, 'recovery after the drop');
    expect(pipeline.server.restRequests).toHaveLength(0);
  });

  test('refreshes the server clock at the start of every recovery run', async () => {
    pipeline = startPipeline();
    publishHistory();
    await waitFor(() => pipeline.finishedRecoveries() === 1, 'first recovery finished');
    expect(pipeline.serverClockRefreshes()).toBe(1);
    pipeline.server.dropConnections();
    await waitFor(() => pipeline.finishedRecoveries() === 2, 'recovery after the drop');
    expect(pipeline.serverClockRefreshes()).toBe(2);
  });
});

describe('worker: the periodic check', () => {
  test('fires without any reconnection and costs no REST call when nothing is missing', async () => {
    pipeline = startPipeline({ gapCheckIntervalMilliseconds: PERIODIC_INTERVAL_MILLISECONDS });
    publishHistory();
    await waitFor(
      () => pipeline.finishedRecoveries() >= 4,
      'three periodic checks after the first',
    );
    expect(pipeline.server.connectionCount()).toBe(1);
    expect(pipeline.server.restRequests).toHaveLength(0);
  });

  test('logs the stream counters, handlerFailureCount included, at every tick', async () => {
    pipeline = startPipeline({ gapCheckIntervalMilliseconds: PERIODIC_INTERVAL_MILLISECONDS });
    publishHistory();
    await waitFor(() => pipeline.logs(WORKER_LOG.STREAM_STATS).length >= 2, 'two stats logs');
    expect(pipeline.logs(WORKER_LOG.STREAM_STATS)[0]).toMatchObject({
      handlerFailureCount: 0,
      loopFailureCount: 0,
      attemptCount: 1,
    });
  });

  test('stop() ends the periodic check for good', async () => {
    pipeline = startPipeline({ gapCheckIntervalMilliseconds: PERIODIC_INTERVAL_MILLISECONDS });
    publishHistory();
    await waitFor(() => pipeline.finishedRecoveries() >= 2, 'one periodic check');
    await pipeline.worker.stop();
    const finishedAtStop = pipeline.finishedRecoveries();
    await Bun.sleep(PERIODIC_INTERVAL_MILLISECONDS * 6);
    expect(pipeline.finishedRecoveries()).toBe(finishedAtStop);
  });
});
