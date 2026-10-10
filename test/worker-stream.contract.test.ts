// Copyright (c) 2026 Ada Technology. All rights reserved.
import { afterEach, describe, expect, test } from 'bun:test';

import type { UpsertCandlesResult } from '../packages/database/src/index.js';
import { WORKER_LOG } from '../apps/worker-cryptoada/src/worker.constant.js';
import { buildFakePrice } from '../packages/market-data/test-support/fake-binance-stream-server.js';
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
  test('a write error is logged with an opaque id and does not stop the worker', async () => {
    let calls = 0;
    await startConnected({
      wrapRepository: (repository) => ({
        ...repository,
        upsertCandles: (candles): Promise<UpsertCandlesResult> => {
          calls += 1;
          if (calls === 1) return Promise.reject(new Error(`falha ${SECRET_MARKER}`));
          return repository.upsertCandles(candles);
        },
      }),
    });
    const firstOpenTime = pipeline.closeNextCandle();
    sendClosed(firstOpenTime);
    await waitFor(
      () => pipeline.logs(WORKER_LOG.CANDLE_WRITE_FAILED).length === 1,
      'failure logged',
    );
    const secondOpenTime = pipeline.closeNextCandle();
    sendClosed(secondOpenTime);
    await waitFor(
      () => pipeline.storedOpenTimes('BTCUSDT').includes(secondOpenTime),
      'next candle stored',
    );
    const failure = pipeline.logs(WORKER_LOG.CANDLE_WRITE_FAILED)[0];
    expect(failure?.candleId).toBe(`BTCUSDT/1h/${firstOpenTime}`);
    expect(JSON.stringify(failure)).not.toContain(SECRET_MARKER);
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
