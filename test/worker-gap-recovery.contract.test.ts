// Copyright (c) 2026 Ada Technology. All rights reserved.
import { afterEach, describe, expect, test } from 'bun:test';

import { WORKER_LOG } from '../apps/worker-cryptoada/src/worker.constant.js';
import {
  PIPELINE_BASE,
  PIPELINE_EXCHANGE,
  PIPELINE_HOUR,
  startPipeline,
  stopPipeline,
  type Pipeline,
} from './fixtures/worker-pipeline.fixture.js';
import { waitFor } from './fixtures/wait-for.fixture.js';

const LOST_CANDLES = 3;
let pipeline: Pipeline;

afterEach(async () => {
  await stopPipeline(pipeline);
});

function openTimesFrom(first: number, count: number): number[] {
  return Array.from({ length: count }, (_unused, index) => first + index * PIPELINE_HOUR);
}

function publishHistory(symbol = 'BTCUSDT'): void {
  pipeline.server.setHistory({
    symbol,
    timeframe: '1h',
    openTimes: openTimesFrom(PIPELINE_BASE - 4 * PIPELINE_HOUR, 12),
  });
}

async function startAndDropWithThreeLostCandles(): Promise<void> {
  pipeline = startPipeline();
  publishHistory();
  await waitFor(() => pipeline.finishedRecoveries() === 1, 'first recovery finished');
  expect(pipeline.server.restRequests).toHaveLength(0);
  pipeline.clock.advance(LOST_CANDLES * PIPELINE_HOUR);
  pipeline.server.dropConnections();
}

describe('worker: gap recovery on reconnection', () => {
  test('downloads only the three lost candles over REST and leaves no hole', async () => {
    await startAndDropWithThreeLostCandles();
    await waitFor(() => pipeline.finishedRecoveries() === 2, 'recovery after the drop');
    expect(pipeline.server.restRequests).toHaveLength(1);
    expect(pipeline.server.restRequests[0]).toMatchObject({
      symbol: 'BTCUSDT',
      interval: '1h',
      startTime: PIPELINE_BASE,
      endTime: PIPELINE_BASE + 2 * PIPELINE_HOUR,
    });
    expect(pipeline.storedOpenTimes('BTCUSDT')).toStrictEqual(
      openTimesFrom(PIPELINE_BASE - PIPELINE_HOUR, LOST_CANDLES + 1),
    );
    const missing = await pipeline.repository.findMissingOpenTimes({
      exchange: PIPELINE_EXCHANGE,
      symbol: 'BTCUSDT',
      timeframe: '1h',
      from: PIPELINE_BASE - PIPELINE_HOUR,
      to: PIPELINE_BASE + LOST_CANDLES * PIPELINE_HOUR,
    });
    expect(missing).toStrictEqual([]);
  });

  test('a candle that arrives both from the stream and from REST is stored once', async () => {
    await startAndDropWithThreeLostCandles();
    await waitFor(() => pipeline.server.openConnectionCount() === 1, 'reconnected');
    pipeline.server.sendEvent({
      symbol: 'BTCUSDT',
      timeframe: '1h',
      openTime: PIPELINE_BASE + 2 * PIPELINE_HOUR,
      isClosed: true,
    });
    await waitFor(() => pipeline.finishedRecoveries() === 2, 'recovery after the drop');
    await waitFor(() => pipeline.logs(WORKER_LOG.CANDLE_STORED).length === 1, 'stream write done');
    const openTimes = pipeline.storedOpenTimes('BTCUSDT');
    expect(new Set(openTimes).size).toBe(openTimes.length);
    expect(openTimes).toHaveLength(LOST_CANDLES + 1);
  });

  test('stream events that arrive while the recovery is still running are applied', async () => {
    pipeline = startPipeline();
    publishHistory();
    await waitFor(() => pipeline.finishedRecoveries() === 1, 'first recovery finished');
    const release = pipeline.server.holdRest();
    pipeline.clock.advance(LOST_CANDLES * PIPELINE_HOUR);
    pipeline.server.dropConnections();
    await waitFor(() => pipeline.server.restRequests.length === 1, 'recovery waiting on REST');
    await waitFor(() => pipeline.server.openConnectionCount() === 1, 'reconnected');
    const live = PIPELINE_BASE + 2 * PIPELINE_HOUR;
    pipeline.server.sendEvent({
      symbol: 'BTCUSDT',
      timeframe: '1h',
      openTime: live,
      isClosed: true,
    });
    await waitFor(
      () => pipeline.storedOpenTimes('BTCUSDT').includes(live),
      'applied during recovery',
    );
    expect(pipeline.storedOpenTimes('BTCUSDT')).not.toContain(PIPELINE_BASE);
    release();
    await waitFor(() => pipeline.finishedRecoveries() === 2, 'recovery finished');
    expect(pipeline.storedOpenTimes('BTCUSDT')).toHaveLength(LOST_CANDLES + 1);
  });

  test('a failed recovery retries with backoff and the stream keeps running', async () => {
    pipeline = startPipeline({ seedOpenTime: PIPELINE_BASE - 3 * PIPELINE_HOUR });
    publishHistory();
    pipeline.server.failRest(2);
    await waitFor(
      () => pipeline.finishedRecoveries() === 1,
      'recovery finished after retries',
      4_000,
    );
    expect(pipeline.logs(WORKER_LOG.GAP_RECOVERY_FAILED)).toHaveLength(2);
    expect(pipeline.server.restRequests).toHaveLength(3);
    expect(pipeline.delays).toStrictEqual([75, 150]);
    expect(pipeline.server.connectionCount()).toBe(1);
    expect(pipeline.storedOpenTimes('BTCUSDT')).toStrictEqual(
      openTimesFrom(PIPELINE_BASE - 3 * PIPELINE_HOUR, 3),
    );
  });

  test('pairs without any stored candle are left to the backfill and never downloaded', async () => {
    pipeline = startPipeline({
      symbols: ['BTCUSDT', 'ETHUSDT'],
      seedSymbols: ['BTCUSDT'],
      seedOpenTime: PIPELINE_BASE - 3 * PIPELINE_HOUR,
    });
    publishHistory('BTCUSDT');
    publishHistory('ETHUSDT');
    await waitFor(() => pipeline.finishedRecoveries() === 1, 'recovery finished');
    expect(pipeline.server.restRequests.every((request) => request.symbol === 'BTCUSDT')).toBe(
      true,
    );
    expect(pipeline.logs(WORKER_LOG.NO_STORED_CANDLES).map((entry) => entry.pairId)).toStrictEqual([
      'ETHUSDT/1h',
    ]);
    expect(pipeline.storedOpenTimes('ETHUSDT')).toStrictEqual([]);
  });
});
