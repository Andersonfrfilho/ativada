// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, test } from 'bun:test';

import { createDatabaseOutageGuard } from '../packages/database/src/index.js';
import type { DatabaseHealth } from '../packages/database/src/connection/resilient-database.types.js';
import { createHeartbeatLoop } from '../apps/worker-ativada/src/heartbeat/heartbeat-loop.js';
import { createWorkerLogger } from '../apps/worker-ativada/src/logging/worker-logger.js';
import {
  FLAKY_ERROR_CODE,
  FLAKY_SECRET_URL,
  FlakyPostgresError,
  wrapLikeDrizzle,
} from '../packages/database/test-support/flaky-sql.js';

const INTERVAL_MILLISECONDS = 10;
const UP: DatabaseHealth = {
  state: 'up',
  consecutiveFailures: 0,
  downSince: undefined,
  nextAttemptAt: undefined,
  lastFailureCode: undefined,
  lastFailureErrno: undefined,
  lastFailureAt: undefined,
};

type Rig = {
  readonly lines: Record<string, unknown>[];
  readonly health: { current: DatabaseHealth };
  readonly build: (recordBeat: () => Promise<void>) => ReturnType<typeof createHeartbeatLoop>;
};

function createRig(): Rig {
  const lines: Record<string, unknown>[] = [];
  const health = { current: UP };
  const logger = createWorkerLogger({
    appName: 'worker-ativada',
    write: (line) => lines.push(JSON.parse(line) as Record<string, unknown>),
  });
  const outage = createDatabaseOutageGuard({
    readHealth: () => health.current,
    now: Date.now,
    write: (entry) => {
      if (entry.level === 'error') logger.error(entry.message, entry.fields);
      else logger.info(entry.message, entry.fields);
    },
  });
  return {
    lines,
    health,
    build: (recordBeat) =>
      createHeartbeatLoop({
        recordBeat,
        logger,
        intervalMilliseconds: INTERVAL_MILLISECONDS,
        outage,
      }),
  };
}

function sleep(milliseconds: number): Promise<void> {
  return new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
}

describe('worker heartbeat loop', () => {
  test('beats right away and then at every interval, until stopped', async () => {
    const rig = createRig();
    let beats = 0;
    const loop = rig.build(() => {
      beats += 1;
      return Promise.resolve();
    });
    loop.start();
    await sleep(INTERVAL_MILLISECONDS * 6);
    await loop.stop();
    const afterStop = beats;
    expect(afterStop).toBeGreaterThanOrEqual(3);
    await sleep(INTERVAL_MILLISECONDS * 4);
    expect(beats).toBe(afterStop);
    expect(rig.lines).toStrictEqual([]);
  });

  test('never overlaps beats, and stop waits for the one in flight', async () => {
    const rig = createRig();
    let inFlight = 0;
    let highestInFlight = 0;
    let finished = 0;
    const loop = rig.build(async () => {
      inFlight += 1;
      highestInFlight = Math.max(highestInFlight, inFlight);
      await sleep(INTERVAL_MILLISECONDS * 3);
      inFlight -= 1;
      finished += 1;
    });
    loop.start();
    await sleep(INTERVAL_MILLISECONDS * 5);
    await loop.stop();
    expect(highestInFlight).toBe(1);
    expect(inFlight).toBe(0);
    expect(finished).toBeGreaterThanOrEqual(1);
  });

  test('database outage: waits for the gate, logs only a code summary and never the raw error', async () => {
    const rig = createRig();
    let attempts = 0;
    const loop = rig.build(() => {
      attempts += 1;
      return Promise.reject(
        wrapLikeDrizzle(
          new FlakyPostgresError(FLAKY_ERROR_CODE.REFUSED),
          'insert into worker_heartbeats',
          ['worker-1'],
        ),
      );
    });
    loop.start();
    await sleep(INTERVAL_MILLISECONDS * 4);
    rig.health.current = { ...UP, state: 'down', nextAttemptAt: Date.now() + 60_000 };
    const attemptsBeforeWait = attempts;
    await sleep(INTERVAL_MILLISECONDS * 4);
    await loop.stop();
    expect(attempts).toBe(attemptsBeforeWait);
    const unavailable = rig.lines.filter((line) => line['message'] === 'database unavailable');
    expect(unavailable).toHaveLength(1);
    expect(unavailable[0]?.['code']).toBe(FLAKY_ERROR_CODE.REFUSED);
    const text = JSON.stringify(rig.lines);
    for (const forbidden of [FLAKY_SECRET_URL, 'insert into', 'worker-1', 'heartbeat failed']) {
      expect(text).not.toContain(forbidden);
    }
  });

  test('recovers on the first beat after the database is back', async () => {
    const rig = createRig();
    let shouldFail = true;
    const loop = rig.build(() =>
      shouldFail
        ? Promise.reject(new FlakyPostgresError(FLAKY_ERROR_CODE.CLOSED))
        : Promise.resolve(),
    );
    loop.start();
    await sleep(INTERVAL_MILLISECONDS * 3);
    shouldFail = false;
    await sleep(INTERVAL_MILLISECONDS * 3);
    await loop.stop();
    expect(rig.lines.some((line) => line['message'] === 'database recovered')).toBe(true);
  });

  test('an error that is not a connection failure is logged by name only', async () => {
    const rig = createRig();
    const loop = rig.build(() => Promise.reject(new TypeError(`bad value ${FLAKY_SECRET_URL}`)));
    loop.start();
    await sleep(INTERVAL_MILLISECONDS * 2);
    await loop.stop();
    const failed = rig.lines.find((line) => line['message'] === 'worker heartbeat failed');
    expect(failed?.['errorName']).toBe('TypeError');
    expect(JSON.stringify(rig.lines)).not.toContain(FLAKY_SECRET_URL);
  });
});
