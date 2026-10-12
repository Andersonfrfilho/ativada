// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, test } from 'bun:test';

import { createWorkerLogger } from '../apps/worker-ativada/src/logging/worker-logger.js';
import {
  createRecoveryRunner,
  type RecoveryOutcome,
} from '../apps/worker-ativada/src/stream/recovery-runner.js';
import { WORKER_LOG } from '../apps/worker-ativada/src/worker.constant.js';
import { waitFor } from './fixtures/wait-for.fixture.js';

const BAN_SLICE_MILLISECONDS = 30_000;
const ONE_DAY_SECONDS = 86_400;

type Harness = {
  readonly runner: ReturnType<typeof createRecoveryRunner>;
  readonly events: string[];
  readonly logs: Record<string, unknown>[];
  readonly pendingSleeps: (() => void)[];
};

function buildHarness(params: {
  readonly outcomes: readonly RecoveryOutcome[];
  readonly isSleepManual?: boolean;
}): Harness {
  const events: string[] = [];
  const logs: Record<string, unknown>[] = [];
  const pendingSleeps: (() => void)[] = [];
  let calls = 0;
  const runner = createRecoveryRunner({
    recover: () => {
      events.push('recover');
      const outcome = params.outcomes[Math.min(calls, params.outcomes.length - 1)];
      calls += 1;
      return Promise.resolve(outcome ?? { failures: 0 });
    },
    logger: createWorkerLogger({
      appName: 'worker-ativada',
      write: (line) => void logs.push(JSON.parse(line) as Record<string, unknown>),
    }),
    sleep: (milliseconds) => {
      events.push(`sleep:${milliseconds}`);
      if (params.isSleepManual !== true) return Promise.resolve();
      return new Promise<void>((resolve) => void pendingSleeps.push(resolve));
    },
    random: () => 0.5,
    backoffBaseMilliseconds: 100,
    backoffMaxMilliseconds: 400,
  });
  return { runner, events, logs, pendingSleeps };
}

async function runToCompletion(harness: Harness): Promise<void> {
  harness.runner.trigger();
  await waitFor(
    () => harness.logs.some((entry) => entry.message === WORKER_LOG.GAP_RECOVERY_FINISHED),
    'recovery finished',
  );
  await harness.runner.stop();
}

describe('recovery runner: IP ban', () => {
  test('sleeps the whole Retry-After in slices, with no recovery call in between, then retries', async () => {
    const harness = buildHarness({
      outcomes: [{ failures: 1, banMilliseconds: 95_000 }, { failures: 0 }],
    });
    await runToCompletion(harness);
    const { events } = harness;
    expect(events).toStrictEqual([
      'recover',
      `sleep:${BAN_SLICE_MILLISECONDS}`,
      `sleep:${BAN_SLICE_MILLISECONDS}`,
      `sleep:${BAN_SLICE_MILLISECONDS}`,
      'sleep:5000',
      'recover',
    ]);
  });

  test('a ban skips the exponential backoff: the slices are the only wait', async () => {
    const harness = buildHarness({
      outcomes: [{ failures: 1, banMilliseconds: 30_000 }, { failures: 0 }],
    });
    await runToCompletion(harness);
    const { events } = harness;
    expect(events.filter((event) => event.startsWith('sleep:'))).toStrictEqual([
      `sleep:${BAN_SLICE_MILLISECONDS}`,
    ]);
  });

  test('stop() during the ban wakes the sleep and ends without another recovery call', async () => {
    const { runner, events, pendingSleeps } = buildHarness({
      outcomes: [{ failures: 1, banMilliseconds: ONE_DAY_SECONDS * 1_000 }],
      isSleepManual: true,
    });
    runner.trigger();
    await waitFor(() => pendingSleeps.length === 1, 'sleeping through the ban');
    const stopped = runner.stop();
    const outcome = await Promise.race([
      stopped.then(() => 'stopped'),
      Bun.sleep(1_000).then(() => 'hung'),
    ]);
    expect(outcome).toBe('stopped');
    expect(events.filter((event) => event === 'recover')).toHaveLength(1);
  });

  test('a new trigger during the ban does not call the API before the ban is over', async () => {
    const { runner, events, pendingSleeps } = buildHarness({
      outcomes: [{ failures: 1, banMilliseconds: 60_000 }, { failures: 0 }],
      isSleepManual: true,
    });
    runner.trigger();
    await waitFor(() => pendingSleeps.length === 1, 'first slice');
    runner.trigger();
    pendingSleeps.shift()?.();
    await waitFor(() => pendingSleeps.length === 1, 'second slice, taken over by the new run');
    expect(events.filter((event) => event === 'recover')).toHaveLength(1);
    pendingSleeps.shift()?.();
    await waitFor(
      () => events.filter((event) => event === 'recover').length === 2,
      'recovery after the ban',
    );
    await runner.stop();
  });
});

describe('recovery runner: a newer trigger supersedes the older run', () => {
  test('the older run stops retrying once a newer generation exists', async () => {
    const { runner, events, pendingSleeps } = buildHarness({
      outcomes: [{ failures: 1 }, { failures: 0 }],
      isSleepManual: true,
    });
    runner.trigger();
    await waitFor(() => pendingSleeps.length === 1, 'first run in its backoff');
    runner.trigger();
    pendingSleeps.shift()?.();
    await waitFor(
      () => events.filter((event) => event === 'recover').length >= 2,
      'second run called recover',
    );
    await runner.stop();
    expect(events.filter((event) => event === 'recover')).toHaveLength(2);
  });

  test('retries with backoff until the recovery has no failures', async () => {
    const harness = buildHarness({
      outcomes: [{ failures: 2 }, { failures: 1 }, { failures: 0 }],
    });
    await runToCompletion(harness);
    const { events, logs } = harness;
    expect(events).toStrictEqual(['recover', 'sleep:75', 'recover', 'sleep:150', 'recover']);
    expect(logs.filter((entry) => entry.message === WORKER_LOG.GAP_RECOVERY_FINISHED)).toHaveLength(
      1,
    );
  });
});
