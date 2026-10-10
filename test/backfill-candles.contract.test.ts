// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, test } from 'bun:test';

import { EXIT_CODE } from '../apps/cron-cryptoada/src/cron.constant.js';
import { createCronLogger } from '../apps/cron-cryptoada/src/logging/cron-logger.js';
import { computeBackfillWindow } from '../apps/cron-cryptoada/src/market/backfill-window.js';
import { runCronTasks } from '../apps/cron-cryptoada/src/run-cron-tasks.js';
import type { CandleRecord, CandleTimeframe } from '../packages/database/src/index.js';
import { TIMEFRAME_DURATION_MILLISECONDS } from '../packages/market-data/src/index.js';
import {
  BACKFILL_NOW,
  buildGridCandle,
  createBackfillHarness,
} from './fixtures/backfill-harness.fixture.js';

const ONE_HOUR = TIMEFRAME_DURATION_MILLISECONDS['1h'];
const PAGE_SIZE = 1_000;
const HOURLY_CANDLES_IN_WINDOW = 17_519;

function fullGrid(symbol: string, timeframe: CandleTimeframe): readonly CandleRecord[] {
  const duration = TIMEFRAME_DURATION_MILLISECONDS[timeframe];
  const window = computeBackfillWindow({ now: BACKFILL_NOW, years: 2, timeframe });
  const candles: CandleRecord[] = [];
  for (let openTime = window.from; openTime < window.to; openTime += duration)
    candles.push(buildGridCandle({ symbol, timeframe, openTime }));
  return candles;
}

function hourOf(hours: number): number {
  return (
    computeBackfillWindow({ now: BACKFILL_NOW, years: 2, timeframe: '1h' }).from + hours * ONE_HOUR
  );
}

function withoutHours(candles: readonly CandleRecord[], hours: readonly number[]): CandleRecord[] {
  const removed = new Set(hours.map(hourOf));
  return candles.filter((candle) => !removed.has(candle.openTime));
}

describe('backfill-candles: an empty database', () => {
  test('downloads the whole two-year window in pages of 1000 and stores every closed candle', async () => {
    const harness = createBackfillHarness();
    const summary = await harness.run();
    const window = computeBackfillWindow({ now: BACKFILL_NOW, years: 2, timeframe: '1h' });
    expect(harness.repository.stored()).toHaveLength(HOURLY_CANDLES_IN_WINDOW);
    expect(summary).toMatchObject({
      inserted: HOURLY_CANDLES_IN_WINDOW,
      failures: 0,
      unfillable: 0,
    });
    expect(harness.grid.calls).toHaveLength(Math.ceil(HOURLY_CANDLES_IN_WINDOW / PAGE_SIZE));
    expect(harness.grid.calls[0]?.startTime).toBe(window.from);
    expect(harness.grid.calls.every((call) => call.limit === PAGE_SIZE)).toBe(true);
  });

  test('never stores the candle that is still open, and never asks for it', async () => {
    const harness = createBackfillHarness({ timeframes: ['1h', '1d'] });
    const summary = await harness.run();
    const storedAfterClose = harness.repository.stored().filter((c) => c.closeTime >= BACKFILL_NOW);
    expect(storedAfterClose).toHaveLength(0);
    const currentHourOpen = Math.floor(BACKFILL_NOW / ONE_HOUR) * ONE_HOUR;
    expect(harness.grid.calls.every((call) => call.endTime < currentHourOpen)).toBe(true);
    expect(summary.unfillable).toBe(0);
  });
});

describe('backfill-candles: the clock', () => {
  test('refreshes the server clock once, before the first request', async () => {
    const harness = createBackfillHarness();
    await harness.run();
    expect(harness.events).toStrictEqual(['clock-refresh:0']);
  });
});

describe('backfill-candles: only what is missing is requested', () => {
  test('two holes cost exactly two requests, bounded by the holes', async () => {
    const seed = withoutHours(
      fullGrid('BTCUSDT', '1h'),
      [...Array(10).keys(), 500].map((n) => n + 10),
    );
    const harness = createBackfillHarness({ seed });
    const summary = await harness.run();
    expect(harness.grid.calls).toHaveLength(2);
    expect(harness.grid.calls[0]).toMatchObject({ startTime: hourOf(10), endTime: hourOf(19) });
    expect(harness.grid.calls[1]).toMatchObject({ startTime: hourOf(510), endTime: hourOf(510) });
    expect(summary.inserted).toBe(11);
    expect(harness.repository.stored()).toHaveLength(HOURLY_CANDLES_IN_WINDOW);
  });

  test('a second run over a complete grid makes zero requests and inserts zero', async () => {
    const harness = createBackfillHarness({ seed: fullGrid('BTCUSDT', '1h') });
    const summary = await harness.run();
    expect(harness.grid.calls).toHaveLength(0);
    expect(summary).toMatchObject({ inserted: 0, failures: 0, unfillable: 0 });
  });

  test('a gap Binance really lacks is reported once as unfillable and is not retried in a loop', async () => {
    const seed = withoutHours(fullGrid('BTCUSDT', '1h'), [100, 101, 102]);
    const harness = createBackfillHarness({
      seed,
      withheld: [{ interval: '1h', fromOpenTime: hourOf(100), toOpenTime: hourOf(102) }],
    });
    const summary = await harness.run();
    expect(harness.grid.calls).toHaveLength(1);
    expect(summary).toMatchObject({ unfillable: 1, failures: 0, inserted: 0 });
    const gapId = `BTCUSDT/1h/${hourOf(100)}-${hourOf(102)}`;
    expect(harness.lines.filter((line) => line.includes(gapId))).toHaveLength(1);
    expect(harness.lines.join('')).toContain('unfillable');
  });
});

describe('backfill-candles: progress is persisted page by page', () => {
  test('a failure on page 3 keeps pages 1 and 2, and the next run does not download them again', async () => {
    const harness = createBackfillHarness();
    harness.grid.failFromCall = 3;
    const failed = await harness.run();
    expect(failed.failures).toBe(1);
    expect(harness.repository.stored()).toHaveLength(2 * PAGE_SIZE);
    expect(harness.repository.upsertSizes).toStrictEqual([PAGE_SIZE, PAGE_SIZE]);
    harness.grid.failFromCall = undefined;
    const callsBeforeResume = harness.grid.calls.length;
    const resumed = await harness.run();
    const resumedCalls = harness.grid.calls.slice(callsBeforeResume);
    expect(resumedCalls[0]?.startTime).toBe(hourOf(2 * PAGE_SIZE));
    expect(resumedCalls.every((call) => call.startTime >= hourOf(2 * PAGE_SIZE))).toBe(true);
    expect(resumed.inserted).toBe(HOURLY_CANDLES_IN_WINDOW - 2 * PAGE_SIZE);
    expect(harness.repository.stored()).toHaveLength(HOURLY_CANDLES_IN_WINDOW);
  });
});

describe('backfill-candles: pairs are isolated and sequential', () => {
  test('one pair failing does not stop the other and the cron exits 1', async () => {
    const harness = createBackfillHarness({ symbols: ['AAAUSDT', 'BBBUSDT'] });
    harness.grid.failingSymbol = 'AAAUSDT';
    const logLines: string[] = [];
    const exitCode = await runCronTasks(
      [{ name: 'backfill-candles', run: harness.run }],
      createCronLogger({ appName: 'cron-cryptoada', write: (line) => void logLines.push(line) }),
    );
    expect(exitCode).toBe(EXIT_CODE.FAILURE);
    expect(harness.repository.stored().filter((c) => c.symbol === 'BBBUSDT')).toHaveLength(
      HOURLY_CANDLES_IN_WINDOW,
    );
    expect(harness.repository.stored().filter((c) => c.symbol === 'AAAUSDT')).toHaveLength(0);
    expect(harness.lines.join('')).toContain('AAAUSDT');
  });

  test('never has two requests in flight at the same time, across symbols and timeframes', async () => {
    const harness = createBackfillHarness({
      symbols: ['AAAUSDT', 'BBBUSDT'],
      timeframes: ['1d', '4h'],
      delayMilliseconds: 2,
    });
    await harness.run();
    expect(harness.grid.calls.length).toBeGreaterThanOrEqual(4);
    expect(harness.grid.maxInFlight()).toBe(1);
  });

  test('walks the pairs in order, symbol by symbol, timeframe by timeframe', async () => {
    const harness = createBackfillHarness({
      symbols: ['AAAUSDT', 'BBBUSDT'],
      timeframes: ['1d', '4h'],
    });
    await harness.run();
    const order = harness.grid.calls.map((call) => `${call.symbol}/${call.interval}`);
    expect([...new Set(order)]).toStrictEqual([
      'AAAUSDT/1d',
      'AAAUSDT/4h',
      'BBBUSDT/1d',
      'BBBUSDT/4h',
    ]);
  });
});
