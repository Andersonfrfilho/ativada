// Copyright (c) 2026 Ada Technology. All rights reserved.
import { afterEach, describe, expect, test } from 'bun:test';

import type { CandleRecord } from '../packages/database/src/index.js';
import { buildFakePrice } from '../packages/market-data-crypto/test-support/fake-binance-stream-server.js';
import {
  PIPELINE_BASE,
  PIPELINE_EXCHANGE,
  startPipeline,
  stopPipeline,
  type Pipeline,
} from './fixtures/worker-pipeline.fixture.js';
import { waitFor } from './fixtures/wait-for.fixture.js';

const THREE_MINUTES = 180_000;
const SYMBOL = 'BTCUSDT';

let pipeline: Pipeline;

afterEach(async () => {
  await stopPipeline(pipeline);
});

function displayCandle(openTime: number): CandleRecord<'3m'> {
  return {
    exchange: PIPELINE_EXCHANGE,
    symbol: SYMBOL,
    timeframe: '3m',
    openTime,
    closeTime: openTime + THREE_MINUTES - 1,
    open: '1.00000000',
    high: '1.00000000',
    low: '1.00000000',
    close: '1.00000000',
    volume: '1.00000000',
    tradeCount: 1,
  };
}

function storedThreeMinuteOpenTimes(): readonly number[] {
  return pipeline.repository
    .stored()
    .filter((candle) => candle.timeframe === '3m')
    .map((candle) => candle.openTime)
    .sort((left, right) => left - right);
}

async function startConnected(options: Parameters<typeof startPipeline>[0] = {}): Promise<void> {
  pipeline = startPipeline({ displayTimeframes: ['3m'], ...options });
  await waitFor(() => pipeline.finishedRecoveries() === 1, 'first recovery finished');
}

function sendThreeMinutes(openTime: number, isClosed: boolean): void {
  pipeline.server.sendEvent({ symbol: SYMBOL, timeframe: '3m', openTime, isClosed });
}

describe('worker: display candles (3m) from the stream', () => {
  test('subscribes to kline_3m next to the execution candles', async () => {
    await startConnected();
    expect(pipeline.server.requestedStreams().join(',')).toContain('btcusdt@kline_3m');
    expect(pipeline.server.requestedStreams().join(',')).toContain('btcusdt@kline_1h');
  });

  test('stores a closed 3m candle with exact decimals, once, and keeps it immutable', async () => {
    await startConnected();
    sendThreeMinutes(PIPELINE_BASE, true);
    await waitFor(() => storedThreeMinuteOpenTimes().length === 1, '3m candle stored');
    sendThreeMinutes(PIPELINE_BASE, true);
    const price = buildFakePrice({ openTime: PIPELINE_BASE, timeframe: '3m' });
    pipeline.server.sendEvent({
      symbol: SYMBOL,
      timeframe: '3m',
      openTime: PIPELINE_BASE,
      isClosed: true,
      prices: { open: price, high: '999.99999999', low: price, close: price },
    });
    sendThreeMinutes(PIPELINE_BASE + THREE_MINUTES, true);
    await waitFor(() => storedThreeMinuteOpenTimes().length === 2, 'next 3m candle stored');
    const stored = pipeline.repository.stored().find((candle) => candle.timeframe === '3m');
    expect(stored).toStrictEqual({
      exchange: PIPELINE_EXCHANGE,
      symbol: SYMBOL,
      timeframe: '3m',
      openTime: PIPELINE_BASE,
      closeTime: PIPELINE_BASE + THREE_MINUTES - 1,
      open: price,
      high: price,
      low: price,
      close: price,
      volume: '12.50000000',
      tradeCount: 7,
    });
  });

  test('an open 3m candle writes nothing', async () => {
    await startConnected();
    sendThreeMinutes(PIPELINE_BASE, false);
    sendThreeMinutes(PIPELINE_BASE + THREE_MINUTES, true);
    await waitFor(() => storedThreeMinuteOpenTimes().length === 1, 'closed 3m candle stored');
    expect(storedThreeMinuteOpenTimes()).toStrictEqual([PIPELINE_BASE + THREE_MINUTES]);
  });

  test('a stored 3m candle never wakes the simulation, an execution candle does', async () => {
    let wakeUps = 0;
    await startConnected({ onCandleStored: () => void (wakeUps += 1) });
    sendThreeMinutes(PIPELINE_BASE, true);
    await waitFor(() => storedThreeMinuteOpenTimes().length === 1, '3m candle stored');
    expect(wakeUps).toBe(0);
    const openTime = pipeline.closeNextCandle();
    pipeline.server.sendEvent({ symbol: SYMBOL, timeframe: '1h', openTime, isClosed: true });
    await waitFor(() => wakeUps === 1, 'execution candle woke the simulation');
  });

  test('a hole of 3m candles inside the lookback window is recovered through REST', async () => {
    const now = PIPELINE_BASE + 1_800_000;
    const windowStart = Math.ceil((now - 3_600_000) / THREE_MINUTES) * THREE_MINUTES;
    const windowEnd = Math.floor(now / THREE_MINUTES) * THREE_MINUTES;
    const grid: number[] = [];
    for (let openTime = windowStart; openTime < windowEnd; openTime += THREE_MINUTES) {
      grid.push(openTime);
    }
    const holes = [grid[5] ?? 0, grid[14] ?? 0];
    pipeline = startPipeline({
      displayTimeframes: ['3m'],
      gapLookbackHours: 1,
      seedDisplay: grid.filter((openTime) => !holes.includes(openTime)).map(displayCandle),
    });
    pipeline.server.setHistory({ symbol: SYMBOL, timeframe: '3m', openTimes: holes });
    await waitFor(() => storedThreeMinuteOpenTimes().length === grid.length, 'holes recovered');
    expect(storedThreeMinuteOpenTimes()).toStrictEqual(grid);
    expect(pipeline.server.restRequests.some((request) => request.interval === '3m')).toBe(true);
  });
});

const ONE_MINUTE = 60_000;

describe('worker: display candles (1m) from the stream', () => {
  test('subscribes to kline_1m and stores a closed 1m candle, never waking the simulation', async () => {
    let wakeUps = 0;
    pipeline = startPipeline({
      displayTimeframes: ['1m'],
      onCandleStored: () => void (wakeUps += 1),
    });
    await waitFor(() => pipeline.finishedRecoveries() === 1, 'first recovery finished');
    expect(pipeline.server.requestedStreams().join(',')).toContain('btcusdt@kline_1m');
    pipeline.server.sendEvent({
      symbol: SYMBOL,
      timeframe: '1m',
      openTime: PIPELINE_BASE,
      isClosed: true,
    });
    await waitFor(
      () => pipeline.repository.stored().some((candle) => candle.timeframe === '1m'),
      '1m candle stored',
    );
    const stored = pipeline.repository.stored().find((candle) => candle.timeframe === '1m');
    expect(stored?.closeTime).toBe(PIPELINE_BASE + ONE_MINUTE - 1);
    expect(wakeUps).toBe(0);
  });
});
