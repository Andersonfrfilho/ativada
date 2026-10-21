// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, test } from 'bun:test';

import { environmentSchema } from '../apps/cron-ativada/src/environment.js';
import { createCronLogger } from '../apps/cron-ativada/src/logging/cron-logger.js';
import { computeBackfillWindow } from '../apps/cron-ativada/src/market/backfill-window.js';
import { createPurgeDisplayCandlesTask } from '../apps/cron-ativada/src/market/purge-display-candles.task.js';
import { EXIT_CODE, TASK_NAME } from '../apps/cron-ativada/src/cron.constant.js';
import { runCronTasks } from '../apps/cron-ativada/src/run-cron-tasks.js';
import { parseEnvironment } from '../packages/environment/src/index.js';
import { BACKFILL_NOW, createBackfillHarness } from './fixtures/backfill-harness.fixture.js';
import { readEnvironmentFile } from './fixtures/environment-file.fixture.js';

const THREE_MINUTES = 180_000;
const DAY = 86_400_000;
const RETENTION_DAYS = 90;
const ONE_MINUTE = 60_000;
const ONE_MINUTE_RETENTION_DAYS = 30;
const MAX_KLINES_PER_REQUEST = 1_000;

function expectedCandleCount(): number {
  const window = computeBackfillWindow({
    now: BACKFILL_NOW,
    days: RETENTION_DAYS,
    timeframe: '3m',
  });
  return (window.to - window.from) / THREE_MINUTES;
}

describe('backfill window in days (display candles)', () => {
  test('90 days back on the 3m grid, to the last closed candle', () => {
    const window = computeBackfillWindow({
      now: BACKFILL_NOW,
      days: RETENTION_DAYS,
      timeframe: '3m',
    });
    expect(window.from % THREE_MINUTES).toBe(0);
    expect(window.to % THREE_MINUTES).toBe(0);
    expect(window.from).toBeGreaterThanOrEqual(BACKFILL_NOW - RETENTION_DAYS * DAY);
    expect(window.from - (BACKFILL_NOW - RETENTION_DAYS * DAY)).toBeLessThan(THREE_MINUTES);
    expect(window.to).toBeLessThanOrEqual(BACKFILL_NOW);
    expect(window.to + THREE_MINUTES - 1).toBeGreaterThanOrEqual(BACKFILL_NOW);
  });

  test('30 days back on the 1m grid, to the last closed candle', () => {
    const window = computeBackfillWindow({
      now: BACKFILL_NOW,
      days: ONE_MINUTE_RETENTION_DAYS,
      timeframe: '1m',
    });
    expect(window.from % ONE_MINUTE).toBe(0);
    expect(window.to % ONE_MINUTE).toBe(0);
    expect(window.from - (BACKFILL_NOW - ONE_MINUTE_RETENTION_DAYS * DAY)).toBeLessThan(ONE_MINUTE);
    expect(window.to + ONE_MINUTE - 1).toBeGreaterThanOrEqual(BACKFILL_NOW);
  });

  test('days win over years when both are given', () => {
    const byDays = computeBackfillWindow({ now: BACKFILL_NOW, days: 1, years: 2, timeframe: '1h' });
    expect(BACKFILL_NOW - byDays.from).toBeLessThanOrEqual(DAY);
  });
});

describe('backfill-display-candles', () => {
  test('stores 90 days of 3m candles in pages of 1.000 and a second run asks for nothing', async () => {
    const harness = createBackfillHarness({
      timeframes: ['3m'],
      days: RETENTION_DAYS,
      symbols: ['BTCUSDT'],
    });
    const first = await harness.run();
    const total = expectedCandleCount();
    expect(first.inserted).toBe(total);
    expect(harness.repository.stored()).toHaveLength(total);
    expect(harness.repository.stored().every((candle) => candle.timeframe === '3m')).toBe(true);
    expect(harness.grid.calls).toHaveLength(Math.ceil(total / MAX_KLINES_PER_REQUEST));
    const callsAfterFirst = harness.grid.calls.length;
    const second = await harness.run();
    expect(second.inserted).toBe(0);
    expect(harness.grid.calls).toHaveLength(callsAfterFirst);
  });

  test('stores 30 days of 1m candles in pages of 1.000 and a second run asks for nothing', async () => {
    const harness = createBackfillHarness({
      timeframes: ['1m'],
      days: ONE_MINUTE_RETENTION_DAYS,
      symbols: ['BTCUSDT'],
    });
    const first = await harness.run();
    const window = computeBackfillWindow({
      now: BACKFILL_NOW,
      days: ONE_MINUTE_RETENTION_DAYS,
      timeframe: '1m',
    });
    const total = (window.to - window.from) / ONE_MINUTE;
    expect(first.inserted).toBe(total);
    expect(harness.repository.stored().every((candle) => candle.timeframe === '1m')).toBe(true);
    expect(harness.grid.calls).toHaveLength(Math.ceil(total / MAX_KLINES_PER_REQUEST));
    const callsAfterFirst = harness.grid.calls.length;
    expect((await harness.run()).inserted).toBe(0);
    expect(harness.grid.calls).toHaveLength(callsAfterFirst);
  });

  test('a 418 stops the run at once, before any further pair', async () => {
    const harness = createBackfillHarness({
      timeframes: ['3m'],
      days: RETENTION_DAYS,
      symbols: ['AAAUSDT', 'BBBUSDT'],
    });
    harness.grid.banFromCall = 3;
    const exitCode = await runCronTasks(
      [{ name: TASK_NAME.BACKFILL_DISPLAY_CANDLES, run: harness.run }],
      createCronLogger({ appName: 'cron-ativada', write: (line) => void harness.lines.push(line) }),
    );
    expect(exitCode).toBe(EXIT_CODE.FAILURE);
    expect(harness.grid.calls).toHaveLength(3);
    expect(harness.grid.calls.every((call) => call.symbol === 'AAAUSDT')).toBe(true);
  });
});

describe('purge-display-candles', () => {
  test('asks the repository for the cutoff of the retention, exclusive, and reports the count', async () => {
    const received: { openedBefore: number; timeframes: unknown }[] = [];
    const task = createPurgeDisplayCandlesTask({
      repository: {
        purgeDisplayCandles: ({ openedBefore, timeframes }) => {
          received.push({ openedBefore, timeframes });
          return Promise.resolve(21);
        },
      },
      retentionDays: { '1m': ONE_MINUTE_RETENTION_DAYS, '3m': RETENTION_DAYS },
      now: () => BACKFILL_NOW,
    });
    const summary = await task();
    expect(received).toStrictEqual([
      { openedBefore: BACKFILL_NOW - ONE_MINUTE_RETENTION_DAYS * DAY, timeframes: ['1m'] },
      { openedBefore: BACKFILL_NOW - RETENTION_DAYS * DAY, timeframes: ['3m'] },
    ]);
    expect(summary).toStrictEqual({ deleted: 42, failures: 0 });
  });
});

describe('cron environment for display candles', () => {
  async function buildSource(
    overrides: Record<string, string> = {},
  ): Promise<Record<string, string>> {
    const base = await readEnvironmentFile('env.test');
    for (const name of [
      'MARKET_DISPLAY_TIMEFRAMES',
      'CANDLE_DISPLAY_RETENTION_DAYS',
      'CANDLE_DISPLAY_1M_RETENTION_DAYS',
      'CRON_TASKS',
    ]) {
      delete base[name];
    }
    return { ...base, ...overrides };
  }

  test('nothing is stored by default and the retention is 90 days', async () => {
    const environment = parseEnvironment(environmentSchema, await buildSource());
    expect(environment.MARKET_DISPLAY_TIMEFRAMES).toStrictEqual([]);
    expect(environment.CANDLE_DISPLAY_RETENTION_DAYS).toBe(90);
    expect(environment.CANDLE_DISPLAY_1M_RETENTION_DAYS).toBe(30);
  });

  test('reads 1m with its own retention, apart from the 3m one', async () => {
    const environment = parseEnvironment(
      environmentSchema,
      await buildSource({
        MARKET_DISPLAY_TIMEFRAMES: '1m,3m',
        CANDLE_DISPLAY_1M_RETENTION_DAYS: '14',
      }),
    );
    expect(environment.MARKET_DISPLAY_TIMEFRAMES).toStrictEqual(['1m', '3m']);
    expect(environment.CANDLE_DISPLAY_1M_RETENTION_DAYS).toBe(14);
    expect(environment.CANDLE_DISPLAY_RETENTION_DAYS).toBe(90);
  });

  test('reads 3m, a retention in range and the two new task names', async () => {
    const environment = parseEnvironment(
      environmentSchema,
      await buildSource({
        MARKET_DISPLAY_TIMEFRAMES: '3m',
        CANDLE_DISPLAY_RETENTION_DAYS: '30',
        CRON_TASKS: 'backfill-display-candles,purge-display-candles',
      }),
    );
    expect(environment.MARKET_DISPLAY_TIMEFRAMES).toStrictEqual(['3m']);
    expect(environment.CANDLE_DISPLAY_RETENTION_DAYS).toBe(30);
    expect(environment.CRON_TASKS).toStrictEqual([
      'backfill-display-candles',
      'purge-display-candles',
    ]);
  });

  test.each([
    ['MARKET_DISPLAY_TIMEFRAMES', '5m'],
    ['MARKET_DISPLAY_TIMEFRAMES', '15m'],
    ['CANDLE_DISPLAY_RETENTION_DAYS', '6'],
    ['CANDLE_DISPLAY_RETENTION_DAYS', '366'],
    ['CANDLE_DISPLAY_RETENTION_DAYS', 'muito'],
    ['CANDLE_DISPLAY_1M_RETENTION_DAYS', '0'],
    ['CANDLE_DISPLAY_1M_RETENTION_DAYS', '91'],
  ])('refuses %s=%s', async (name, value) => {
    const source = await buildSource({ [name]: value });
    expect(() => parseEnvironment(environmentSchema, source)).toThrow(name);
  });
});
