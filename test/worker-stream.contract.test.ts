// Copyright (c) 2026 Ada Technology. All rights reserved.
import { afterEach, describe, expect, test } from 'bun:test';

import type { UpsertCandlesResult } from '../packages/database/src/index.js';
import { WORKER_LOG } from '../apps/worker-ativada/src/worker.constant.js';
import { buildFakePrice } from '../packages/market-data-crypto/test-support/fake-binance-stream-server.js';
import {
  PIPELINE_EXCHANGE,
  PIPELINE_HOUR,
  startPipeline,
  stopPipeline,
  type Pipeline,
} from './fixtures/worker-pipeline.fixture.js';
import { waitFor } from './fixtures/wait-for.fixture.js';

const SECRET_MARKER = 'SEGREDO_DO_BANCO';
const SLOW_WRITE_MILLISECONDS = 120;

let pipeline: Pipeline;

afterEach(async () => {
  await stopPipeline(pipeline);
});

function failingRepository(
  shouldFail: () => boolean,
): NonNullable<Parameters<typeof startPipeline>[0]>['wrapRepository'] & {} {
  return (repository) => ({
    ...repository,
    upsertCandles: (candles): Promise<UpsertCandlesResult> => {
      if (shouldFail()) return Promise.reject(new Error(`falha ${SECRET_MARKER}`));
      return repository.upsertCandles(candles);
    },
  });
}

async function startConnected(options: Parameters<typeof startPipeline>[0] = {}): Promise<void> {
  pipeline = startPipeline(options);
  await waitFor(() => pipeline.finishedRecoveries() === 1, 'first recovery finished');
}

function sendClosed(openTime: number): void {
  pipeline.server.sendEvent({ symbol: 'BTCUSDT', timeframe: '1h', openTime, isClosed: true });
}

describe('worker: closed candles from the stream', () => {
  test('stores a closed candle with exact decimals and the configured exchange', async () => {
    await startConnected();
    const openTime = pipeline.closeNextCandle();
    sendClosed(openTime);
    await waitFor(() => pipeline.storedOpenTimes('BTCUSDT').includes(openTime), 'candle stored');
    const stored = pipeline.repository.stored().find((candle) => candle.openTime === openTime);
    const price = buildFakePrice({ openTime, timeframe: '1h' });
    expect(stored).toStrictEqual({
      exchange: PIPELINE_EXCHANGE,
      symbol: 'BTCUSDT',
      timeframe: '1h',
      openTime,
      closeTime: openTime + PIPELINE_HOUR - 1,
      open: price,
      high: price,
      low: price,
      close: price,
      volume: '12.50000000',
      tradeCount: 7,
    });
  });

  test('a closed candle is not lost when the local clock is a few seconds behind', async () => {
    await startConnected();
    const openTime = pipeline.closeNextCandle();
    pipeline.clock.advance(-(PIPELINE_HOUR / 2 + 3_000));
    sendClosed(openTime);
    await waitFor(() => pipeline.storedOpenTimes('BTCUSDT').includes(openTime), 'candle stored');
    expect(pipeline.logs(WORKER_LOG.CANDLE_WRITE_FAILED)).toHaveLength(0);
  });

  test('ignores an open candle: nothing is written', async () => {
    await startConnected();
    const openTime = pipeline.closeNextCandle();
    pipeline.server.sendEvent({ symbol: 'BTCUSDT', timeframe: '1h', openTime, isClosed: false });
    sendClosed(openTime);
    await waitFor(() => pipeline.storedOpenTimes('BTCUSDT').includes(openTime), 'candle stored');
    expect(pipeline.logs(WORKER_LOG.CANDLE_STORED)).toHaveLength(1);
  });

  test('the same candle from the stream twice does not duplicate', async () => {
    await startConnected();
    const openTime = pipeline.closeNextCandle();
    sendClosed(openTime);
    sendClosed(openTime);
    await waitFor(() => pipeline.logs(WORKER_LOG.CANDLE_STORED).length === 2, 'both writes done');
    expect(pipeline.storedOpenTimes('BTCUSDT').filter((time) => time === openTime)).toHaveLength(1);
    expect(pipeline.logs(WORKER_LOG.CANDLE_STORED).map((entry) => entry.inserted)).toStrictEqual([
      1, 0,
    ]);
  });

  test('a malformed or unknown message neither stops the worker nor stores anything', async () => {
    await startConnected();
    pipeline.server.sendText('lixo');
    pipeline.server.sendText(JSON.stringify({ stream: 'x', data: { e: 'trade' } }));
    const openTime = pipeline.closeNextCandle();
    sendClosed(openTime);
    await waitFor(() => pipeline.storedOpenTimes('BTCUSDT').includes(openTime), 'candle stored');
    expect(pipeline.logs(WORKER_LOG.MALFORMED)).toHaveLength(2);
    expect(pipeline.server.connectionCount()).toBe(1);
  });
});

describe('worker: write failures and shutdown', () => {
  test('a transient write error is retried with backoff and the candle is stored without REST', async () => {
    let failuresLeft = 2;
    await startConnected({ wrapRepository: failingRepository(() => failuresLeft-- > 0) });
    const openTime = pipeline.closeNextCandle();
    sendClosed(openTime);
    await waitFor(() => pipeline.storedOpenTimes('BTCUSDT').includes(openTime), 'candle stored');
    expect(pipeline.delays).toStrictEqual([200, 400]);
    expect(pipeline.server.restRequests).toHaveLength(0);
    expect(pipeline.logs(WORKER_LOG.CANDLE_WRITE_FAILED)).toHaveLength(0);
    expect(JSON.stringify(pipeline.logs(WORKER_LOG.CANDLE_WRITE_RETRY))).not.toContain(
      SECRET_MARKER,
    );
  });

  test('a write that keeps failing is logged with an opaque id and the recovery brings the candle back', async () => {
    let failuresLeft = 3;
    await startConnected({ wrapRepository: failingRepository(() => failuresLeft-- > 0) });
    const openTime = pipeline.closeNextCandle();
    pipeline.server.setHistory({ symbol: 'BTCUSDT', timeframe: '1h', openTimes: [openTime] });
    sendClosed(openTime);
    await waitFor(() => pipeline.storedOpenTimes('BTCUSDT').includes(openTime), 'candle recovered');
    const failure = pipeline.logs(WORKER_LOG.CANDLE_WRITE_FAILED);
    expect(failure).toHaveLength(1);
    expect(failure[0]?.candleId).toBe(`BTCUSDT/1h/${openTime}`);
    expect(JSON.stringify(failure)).not.toContain(SECRET_MARKER);
    expect(pipeline.server.restRequests).toHaveLength(1);
    expect(pipeline.server.restRequests[0]).toMatchObject({
      startTime: openTime,
      endTime: openTime,
    });
    expect(pipeline.server.connectionCount()).toBe(1);
  });

  test('stop() waits for in-flight writes, closes the stream for good and is idempotent', async () => {
    let started = 0;
    await startConnected({
      wrapRepository: (repository) => ({
        ...repository,
        upsertCandles: async (candles): Promise<UpsertCandlesResult> => {
          started += 1;
          await Bun.sleep(SLOW_WRITE_MILLISECONDS);
          return repository.upsertCandles(candles);
        },
      }),
    });
    const openTime = pipeline.closeNextCandle();
    sendClosed(openTime);
    await waitFor(() => started === 1, 'write started');
    await pipeline.worker.stop();
    await pipeline.worker.stop();
    expect(pipeline.storedOpenTimes('BTCUSDT')).toContain(openTime);
    await waitFor(() => pipeline.server.openConnectionCount() === 0, 'socket closed');
    await Bun.sleep(150);
    expect(pipeline.server.connectionCount()).toBe(1);
  });
});
