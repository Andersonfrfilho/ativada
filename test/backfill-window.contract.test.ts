// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, test } from 'bun:test';

import { EXIT_CODE } from '../apps/cron-crypto/src/cron.constant.js';
import { computeBackfillWindow } from '../apps/cron-crypto/src/market/backfill-window.js';
import { groupConsecutiveOpenTimes } from '../apps/cron-crypto/src/market/group-consecutive-open-times.js';
import { createCronLogger } from '../apps/cron-crypto/src/logging/cron-logger.js';
import { runCronTasks, type CronTask } from '../apps/cron-crypto/src/run-cron-tasks.js';
import { selectCronTasks } from '../apps/cron-crypto/src/select-cron-tasks.js';

const NOW = Date.parse('2026-10-09T12:34:56.789Z');
const ONE_HOUR = 3_600_000;

describe('backfill window', () => {
  test.each([
    ['15m', '2024-10-09T12:45:00.000Z', '2026-10-09T12:30:00.000Z'],
    ['1h', '2024-10-09T13:00:00.000Z', '2026-10-09T12:00:00.000Z'],
    ['4h', '2024-10-09T16:00:00.000Z', '2026-10-09T12:00:00.000Z'],
    ['1d', '2024-10-10T00:00:00.000Z', '2026-10-09T00:00:00.000Z'],
  ] as const)('two years back to the last closed candle, on the %s grid', (timeframe, from, to) => {
    const window = computeBackfillWindow({ now: NOW, years: 2, timeframe });
    expect(new Date(window.from).toISOString()).toBe(from);
    expect(new Date(window.to).toISOString()).toBe(to);
  });

  test('the window end is the open of the candle still forming, never a candle that has not closed', () => {
    const window = computeBackfillWindow({ now: NOW, years: 2, timeframe: '1h' });
    expect(window.to).toBeLessThanOrEqual(NOW);
    expect(window.to + ONE_HOUR - 1).toBeGreaterThanOrEqual(NOW);
  });

  test('on an exact boundary the candle that just closed is inside the window', () => {
    const boundary = Date.parse('2026-10-09T12:00:00.000Z');
    const window = computeBackfillWindow({ now: boundary, years: 1, timeframe: '1h' });
    expect(new Date(window.to).toISOString()).toBe('2026-10-09T12:00:00.000Z');
  });

  test('the number of years moves the start', () => {
    const window = computeBackfillWindow({ now: NOW, years: 5, timeframe: '1d' });
    expect(new Date(window.from).toISOString()).toBe('2021-10-10T00:00:00.000Z');
  });
});

describe('groupConsecutiveOpenTimes', () => {
  const group = (hours: readonly number[]): unknown =>
    groupConsecutiveOpenTimes({
      openTimes: hours.map((hour) => hour * ONE_HOUR),
      durationMilliseconds: ONE_HOUR,
    });

  test('merges neighbours on the grid into inclusive intervals', () => {
    expect(group([0, 1, 2, 5, 6, 9])).toStrictEqual([
      { from: 0, to: 2 * ONE_HOUR },
      { from: 5 * ONE_HOUR, to: 6 * ONE_HOUR },
      { from: 9 * ONE_HOUR, to: 9 * ONE_HOUR },
    ]);
  });

  test('nothing missing means nothing to request', () => {
    expect(group([])).toStrictEqual([]);
  });
});

describe('CRON_TASKS selection', () => {
  const tasks: readonly CronTask[] = ['alpha', 'beta', 'gamma'].map((name) => ({
    name,
    run: (): Promise<{ readonly failures: number }> => Promise.resolve({ failures: 0 }),
  }));
  const namesOf = (selected: readonly CronTask[]): readonly string[] =>
    selected.map((task) => task.name);

  test('without a list every task runs', () => {
    expect(namesOf(selectCronTasks({ tasks, names: undefined }))).toStrictEqual([
      'alpha',
      'beta',
      'gamma',
    ]);
  });

  test('with a list only those run, in the original order', () => {
    expect(namesOf(selectCronTasks({ tasks, names: ['gamma', 'alpha'] }))).toStrictEqual([
      'alpha',
      'gamma',
    ]);
  });

  test('a failing selected task still exits 1', async () => {
    const failing: CronTask = { name: 'alpha', run: () => Promise.resolve({ failures: 1 }) };
    const code = await runCronTasks(
      selectCronTasks({ tasks: [failing, ...tasks.slice(1)], names: ['alpha'] }),
      createCronLogger({ appName: 'cron-crypto', write: () => undefined }),
    );
    expect(code).toBe(EXIT_CODE.FAILURE);
  });
});
