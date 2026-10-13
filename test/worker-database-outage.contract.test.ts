// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, test } from 'bun:test';

import { createDatabaseOutageGuard } from '../packages/database/src/index.js';
import { createResilientDatabase } from '../packages/database/src/connection/resilient-database.js';
import { createAlertScheduler } from '../apps/worker-ativada/src/alerts/alert-scheduler.js';
import { createLiveScheduler } from '../apps/worker-ativada/src/live/live-scheduler.js';
import { createWorkerLogger } from '../apps/worker-ativada/src/logging/worker-logger.js';
import {
  createRecoveryRunner,
  type RecoveryOutcome,
} from '../apps/worker-ativada/src/stream/recovery-runner.js';
import { recoverGaps } from '../apps/worker-ativada/src/stream/gap-recovery.js';
import {
  createFlakyServer,
  FLAKY_MODE,
  FLAKY_SECRET_URL,
  FlakyPostgresError,
  wrapLikeDrizzle,
  type FlakyServer,
} from '../packages/database/test-support/flaky-sql.js';

const ROUND_MILLISECONDS = 5_000;
const ROUNDS = 1_000;
const SUMMARY_WINDOW_MILLISECONDS = 60_000;

type Line = { readonly at: number; readonly entry: Record<string, unknown> };

type Rig = {
  readonly server: FlakyServer;
  readonly database: ReturnType<typeof createResilientDatabase>;
  readonly lines: Line[];
  readonly logger: ReturnType<typeof createWorkerLogger>;
  readonly guard: ReturnType<typeof createDatabaseOutageGuard>;
  readonly clock: { now: number };
};

function createRig(): Rig {
  const server = createFlakyServer();
  const clock = { now: 1_000_000 };
  const lines: Line[] = [];
  const database = createResilientDatabase({
    openClient: () => server.openClient(),
    queryTimeoutMilliseconds: 1_000,
    confirmTimeoutMilliseconds: 1_000,
    now: () => clock.now,
    random: () => 0.5,
    failureThreshold: 2,
    reconnectBaseMilliseconds: 1_000,
    reconnectMaxMilliseconds: 30_000,
  });
  const logger = createWorkerLogger({
    appName: 'worker-ativada',
    write: (line) => {
      lines.push({ at: clock.now, entry: JSON.parse(line) as Record<string, unknown> });
    },
  });
  const guard = createDatabaseOutageGuard({
    readHealth: () => database.readHealth(),
    now: () => clock.now,
    write: (entry) => {
      if (entry.level === 'error') logger.error(entry.message, entry.fields);
      else logger.info(entry.message, entry.fields);
    },
  });
  return { server, database, lines, logger, guard, clock };
}

function nextTick(): Promise<void> {
  return new Promise<void>((resolve) => setTimeout(resolve, 0));
}

function expectNothingSensitive(lines: readonly Line[]): void {
  const text = JSON.stringify(lines);
  for (const forbidden of [FLAKY_SECRET_URL, 's3cret', 'postgres://', 'Failed query', 'select 1']) {
    expect(text).not.toContain(forbidden);
  }
}

function expectOutageSummaries(lines: readonly Line[]): void {
  const failures = lines.filter((line) => line.entry['message'] === 'database unavailable');
  expect(failures.length).toBeGreaterThanOrEqual(2);
  for (const line of failures) expect(typeof line.entry['code']).toBe('string');
  for (let index = 1; index < failures.length; index += 1) {
    const gap = (failures[index]?.at ?? 0) - (failures[index - 1]?.at ?? 0);
    expect(gap).toBeGreaterThanOrEqual(SUMMARY_WINDOW_MILLISECONDS);
  }
}

describe('guard of the loops (database package)', () => {
  test('waits only while down and before the next attempt; only connection errors are absorbed', () => {
    const clock = { now: 100 };
    const written: string[] = [];
    let health = { state: 'up', nextAttemptAt: undefined } as {
      state: 'up' | 'down';
      nextAttemptAt: number | undefined;
    };
    const guard = createDatabaseOutageGuard({
      readHealth: () => ({
        state: health.state,
        consecutiveFailures: 0,
        downSince: undefined,
        nextAttemptAt: health.nextAttemptAt,
        lastFailureCode: undefined,
        lastFailureErrno: undefined,
        lastFailureAt: undefined,
      }),
      now: () => clock.now,
      write: (entry) => void written.push(entry.message),
    });
    expect(guard.isWaiting()).toBe(false);
    health = { state: 'down', nextAttemptAt: 600 };
    expect(guard.isWaiting()).toBe(true);
    expect(guard.waitMilliseconds()).toBe(500);
    clock.now = 600;
    expect(guard.isWaiting()).toBe(false);
    expect(guard.handleFailure(new Error('column does not exist'))).toBe(false);
    expect(
      guard.handleFailure(
        wrapLikeDrizzle(new FlakyPostgresError('ERR_POSTGRES_CONNECTION_CLOSED')),
      ),
    ).toBe(true);
    guard.handleSuccess();
    expect(written).toStrictEqual(['database unavailable', 'database recovered']);
  });
});

describe('live loop with the database out', () => {
  test('1000 rounds give at most one line per minute, all with a code, none with URL or password; it returns on the next round', async () => {
    const rig = createRig();
    let ticks = 0;
    const scheduler = createLiveScheduler({
      logger: rig.logger,
      pollMilliseconds: 3_600_000,
      outage: rig.guard,
      evaluator: {
        tick: async () => {
          ticks += 1;
          await rig.database.unsafe('select 1', [FLAKY_SECRET_URL]);
          return { claimed: 0, evaluated: 0, steps: 0, ended: 0, failed: 0 };
        },
        release: () => Promise.resolve(0),
      },
    });
    rig.server.setMode(FLAKY_MODE.REFUSED);
    for (let round = 0; round < ROUNDS; round += 1) {
      scheduler.trigger();
      await nextTick();
      rig.clock.now += ROUND_MILLISECONDS;
    }
    expect(ticks).toBeLessThan(ROUNDS);
    expectOutageSummaries(rig.lines);
    expectNothingSensitive(rig.lines);
    expect(rig.lines.some((line) => line.entry['message'] === 'live tick failed')).toBe(false);

    rig.server.setMode(FLAKY_MODE.HEALTHY);
    rig.clock.now = rig.database.readHealth().nextAttemptAt ?? rig.clock.now;
    scheduler.trigger();
    await nextTick();
    await nextTick();
    expect(rig.database.readHealth().state).toBe('up');
    expect(rig.lines.at(-1)?.entry['message']).toBe('database recovered');
    await scheduler.stop();
  });

  test('an error that is not a connection error still goes to the log by name only', async () => {
    const rig = createRig();
    const scheduler = createLiveScheduler({
      logger: rig.logger,
      pollMilliseconds: 3_600_000,
      outage: rig.guard,
      evaluator: {
        tick: () => Promise.reject(new TypeError('secret detail postgres://u:p@h/db')),
        release: () => Promise.resolve(0),
      },
    });
    scheduler.trigger();
    await nextTick();
    expect(rig.lines).toHaveLength(1);
    expect(rig.lines[0]?.entry).toMatchObject({
      message: 'live tick failed',
      errorName: 'TypeError',
    });
    expectNothingSensitive(rig.lines);
    await scheduler.stop();
  });
});

describe('alert loop with the database out', () => {
  test('1000 cycles give at most one line per minute, all with a code, none with URL or password; it returns on the next cycle', async () => {
    const rig = createRig();
    const scheduler = createAlertScheduler({
      logger: rig.logger,
      pollMilliseconds: 3_600_000,
      outage: rig.guard,
      dispatcher: {
        tick: async () => {
          await rig.database.begin(() => Promise.resolve());
          return { claimed: 0, sent: 0, retried: 0, failed: 0, skipped: 0, errored: 0 };
        },
      },
    });
    rig.server.setMode(FLAKY_MODE.CLOSED);
    for (let round = 0; round < ROUNDS; round += 1) {
      scheduler.trigger();
      await nextTick();
      rig.clock.now += ROUND_MILLISECONDS;
    }
    expectOutageSummaries(rig.lines);
    expectNothingSensitive(rig.lines);
    expect(rig.lines.some((line) => line.entry['message'] === 'alert dispatch failed')).toBe(false);

    rig.server.setMode(FLAKY_MODE.HEALTHY);
    rig.clock.now = rig.database.readHealth().nextAttemptAt ?? rig.clock.now;
    scheduler.trigger();
    await nextTick();
    await nextTick();
    expect(rig.lines.at(-1)?.entry['message']).toBe('database recovered');
    await scheduler.stop();
  });
});

describe('gap recovery loop with the database out', () => {
  test('keeps retrying after the porteiro backoff, logs only the summary and finishes when the database is back', async () => {
    const rig = createRig();
    let attempts = 0;
    let finished = false;
    const runner = createRecoveryRunner({
      recover: async (): Promise<RecoveryOutcome> => {
        attempts += 1;
        await rig.database.unsafe('select 1');
        return { failures: 0 };
      },
      logger: rig.logger,
      outage: rig.guard,
      sleep: (milliseconds) => {
        rig.clock.now += milliseconds;
        if (rig.clock.now > 1_000_000 + 400_000) rig.server.setMode(FLAKY_MODE.HEALTHY);
        return Promise.resolve();
      },
      random: () => 0.5,
      backoffBaseMilliseconds: 100,
      backoffMaxMilliseconds: 400,
    });
    rig.server.setMode(FLAKY_MODE.REFUSED);
    runner.trigger();
    while (!finished) {
      await nextTick();
      finished = rig.lines.some((line) => line.entry['message'] === 'gap recovery finished');
      if (attempts > 5_000) throw new Error('recovery never finished');
    }
    expectOutageSummaries(rig.lines);
    expectNothingSensitive(rig.lines);
    expect(rig.lines.some((line) => line.entry['message'] === 'gap recovery failed')).toBe(false);
    expect(rig.lines.some((line) => line.entry['message'] === 'gap recovery retry scheduled')).toBe(
      false,
    );
    expect(rig.lines.some((line) => line.entry['message'] === 'database recovered')).toBe(true);
    await runner.stop();
  });

  test('recoverGaps lets a connection error through instead of counting it per pair', async () => {
    const rig = createRig();
    const closed = wrapLikeDrizzle(new FlakyPostgresError('ERR_POSTGRES_CONNECTION_CLOSED'));
    const fail = (): Promise<never> => Promise.reject(closed);
    const repository = {
      findLatestOpenTime: fail,
      findMissingOpenTimes: fail,
      upsertCandles: fail,
    };
    const dependencies = {
      repository,
      client: { fetchKlinesRange: fail },
      logger: rig.logger,
      now: (): number => rig.clock.now,
      refreshClock: (): Promise<void> => Promise.resolve(),
      exchange: 'binance',
      symbols: ['BTCUSDT', 'ETHUSDT'],
      timeframes: ['1h', '1d'] as const,
      lookbackMilliseconds: 3_600_000,
      unfillable: new Set<string>(),
      signal: new AbortController().signal,
    };
    const rejected = await recoverGaps({
      ...dependencies,
      timeframes: ['1h', '1d'],
      outage: rig.guard,
    }).then(
      () => false,
      () => true,
    );
    expect(rejected).toBe(true);
    expect(rig.lines).toHaveLength(0);
    const counted = await recoverGaps({ ...dependencies, timeframes: ['1h', '1d'] });
    expect(counted.failures).toBe(4);
  });
});
