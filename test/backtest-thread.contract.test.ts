// Copyright (c) 2026 Ada Technology. All rights reserved.
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';

import { BACKTEST_ERROR_CODE } from '../apps/api-ativada/src/backtest/backtest.constant.js';
import {
  BACKTEST_EVENT_SCHEMA,
  BACKTEST_REQUEST_SCHEMA,
} from '../apps/api-ativada/src/backtest/backtest-messages.js';
import type {
  BacktestThreadOutcome,
  RecordFailure,
} from '../apps/api-ativada/src/backtest/thread-outcome.js';
import { createApiRoutes } from '../apps/api-ativada/src/routes/create-api-routes.js';
import { createRateLimiter } from '../apps/api-ativada/src/rate-limit/rate-limiter.js';
import { createRouter } from '../apps/api-ativada/src/router/create-router.js';
import {
  BACKTEST_MUTANT_VARIABLE,
  loadThreadApi,
  resolveBacktestSource,
} from './fixtures/backtest/backtest-api.fixture.js';
import { IN_MEMORY_RUN_ID } from './fixtures/backtest/in-memory-backtest-database.fixture.js';
import { buildApiRouteDependencies } from './fixtures/api-route-dependencies.fixture.js';

const WORKER_URL = new URL('./fixtures/backtest/test-backtest.worker.ts', import.meta.url).href;
const GENEROUS_TIMEOUT_MILLISECONDS = 60_000;
const SHORT_TIMEOUT_MILLISECONDS = 400;
const HEALTH_BUDGET_MILLISECONDS = 100;
const HEARTBEAT_SETTLE_MILLISECONDS = 250;
const HEALTH_PATH = '/v1/health';

type RecordedFailure = { readonly runId: string; readonly errorCode: string };

let scratchDirectory = '';

beforeAll(async () => {
  scratchDirectory = await mkdtemp(`${tmpdir()}/backtest-thread-`);
});

afterAll(async () => {
  await rm(scratchDirectory, { recursive: true, force: true });
});

type Rig = {
  readonly run: () => Promise<BacktestThreadOutcome>;
  readonly terminateAll: () => Promise<void>;
  readonly failures: RecordedFailure[];
  readonly progress: number[];
};

async function buildRig(params: {
  readonly mode: string;
  readonly timeoutMilliseconds?: number;
  readonly heartbeatFile?: string;
  readonly closeMarkerFile?: string;
  readonly isRecorded?: boolean;
}): Promise<Rig> {
  const { createBacktestThreadRunner } = await loadThreadApi();
  const failures: RecordedFailure[] = [];
  const progress: number[] = [];
  const recordFailure: RecordFailure = (failure) => {
    failures.push({ runId: failure.runId, errorCode: failure.errorCode });
    return Promise.resolve(params.isRecorded ?? true);
  };
  const runner = createBacktestThreadRunner({
    workerUrl: WORKER_URL,
    workerEnvironment: {
      TEST_WORKER_MODE: params.mode,
      [BACKTEST_MUTANT_VARIABLE]: resolveBacktestSource(),
      ...(params.heartbeatFile === undefined ? {} : { TEST_HEARTBEAT_FILE: params.heartbeatFile }),
      ...(params.closeMarkerFile === undefined ? {} : { TEST_CLOSE_FILE: params.closeMarkerFile }),
    },
    timeoutMilliseconds: params.timeoutMilliseconds ?? GENEROUS_TIMEOUT_MILLISECONDS,
    recordFailure,
    onProgress: (event) => progress.push(event.progress),
  });
  return {
    run: () => runner.run(IN_MEMORY_RUN_ID),
    terminateAll: () => runner.terminateAll(),
    failures,
    progress,
  };
}

async function readBeats(file: string): Promise<number> {
  try {
    return Number(await readFile(file, 'utf8'));
  } catch {
    return 0;
  }
}

describe('backtest thread: a real run in a worker_thread with the real engine and use case', () => {
  test('completes, reports progress only forward and the phases of the wall time', async () => {
    const rig = await buildRig({ mode: 'golden' });
    const outcome = await rig.run();
    expect(outcome.status).toBe('completed');
    if (outcome.status !== 'completed') throw new Error('esperado completed');
    expect(outcome.processedCandles).toBe(500);
    expect(outcome.gapCandles).toBe(0);
    expect(outcome.batches).toBeGreaterThan(0);
    expect(outcome.startMilliseconds).toBeGreaterThan(0);
    expect(outcome.phases.engine).toBeGreaterThan(0);
    expect(rig.failures).toStrictEqual([]);
    expect(rig.progress.length).toBeGreaterThan(0);
    expect([...rig.progress].sort((first, second) => first - second)).toStrictEqual(rig.progress);
    expect(Math.max(...rig.progress)).toBeLessThanOrEqual(99);
  });
});

describe('backtest thread: the thread opens its own database and closes it before it ends', () => {
  test('the database is closed by the thread once the run is over', async () => {
    const closeMarkerFile = `${scratchDirectory}/close-marker`;
    const rig = await buildRig({ mode: 'golden', closeMarkerFile });
    expect((await rig.run()).status).toBe('completed');
    expect(await readFile(closeMarkerFile, 'utf8')).toBe('closed');
  });
});

describe('backtest thread: a thread that dies marks the run failed WORKER_CRASHED', () => {
  test.each(['exit', 'throw', 'garbage'])('mode %s', async (mode) => {
    const rig = await buildRig({ mode });
    const outcome = await rig.run();
    expect(outcome).toMatchObject({
      status: 'failed',
      runId: IN_MEMORY_RUN_ID,
      errorCode: BACKTEST_ERROR_CODE.WORKER_CRASHED,
      isRecorded: true,
    });
    expect(rig.failures).toStrictEqual([
      { runId: IN_MEMORY_RUN_ID, errorCode: BACKTEST_ERROR_CODE.WORKER_CRASHED },
    ]);
  });

  test('a failure that the main thread cannot record is reported as not recorded', async () => {
    const rig = await buildRig({ mode: 'exit', isRecorded: false });
    const outcome = await rig.run();
    expect(outcome).toMatchObject({ status: 'failed', isRecorded: false });
  });
});

describe('backtest thread: the timeout ends the thread and marks BACKTEST_TIMEOUT', () => {
  test.each(['hang', 'silent'])('mode %s', async (mode) => {
    const rig = await buildRig({ mode, timeoutMilliseconds: SHORT_TIMEOUT_MILLISECONDS });
    const startedAt = performance.now();
    const outcome = await rig.run();
    const elapsed = performance.now() - startedAt;
    expect(outcome).toMatchObject({
      status: 'failed',
      errorCode: BACKTEST_ERROR_CODE.BACKTEST_TIMEOUT,
      isRecorded: true,
    });
    expect(elapsed).toBeGreaterThanOrEqual(SHORT_TIMEOUT_MILLISECONDS - 50);
    expect(elapsed).toBeLessThan(SHORT_TIMEOUT_MILLISECONDS + 3_000);
    expect(rig.failures).toStrictEqual([
      { runId: IN_MEMORY_RUN_ID, errorCode: BACKTEST_ERROR_CODE.BACKTEST_TIMEOUT },
    ]);
  });

  test('the thread really stops: its heartbeat does not move after the timeout', async () => {
    const heartbeatFile = `${scratchDirectory}/timeout-heartbeat`;
    const rig = await buildRig({
      mode: 'silent',
      timeoutMilliseconds: SHORT_TIMEOUT_MILLISECONDS,
      heartbeatFile,
    });
    await rig.run();
    const afterTimeout = await readBeats(heartbeatFile);
    expect(afterTimeout).toBeGreaterThan(0);
    await Bun.sleep(HEARTBEAT_SETTLE_MILLISECONDS);
    expect(await readBeats(heartbeatFile)).toBe(afterTimeout);
  });
});

describe('backtest thread: graceful shutdown terminates the threads', () => {
  test('terminateAll ends a running thread without marking the run failed', async () => {
    const heartbeatFile = `${scratchDirectory}/shutdown-heartbeat`;
    const rig = await buildRig({ mode: 'silent', heartbeatFile });
    const pending = rig.run();
    await Bun.sleep(HEARTBEAT_SETTLE_MILLISECONDS);
    expect(await readBeats(heartbeatFile)).toBeGreaterThan(0);
    await rig.terminateAll();
    expect(await pending).toStrictEqual({ status: 'terminated', runId: IN_MEMORY_RUN_ID });
    expect(rig.failures).toStrictEqual([]);
    const afterShutdown = await readBeats(heartbeatFile);
    await Bun.sleep(HEARTBEAT_SETTLE_MILLISECONDS);
    expect(await readBeats(heartbeatFile)).toBe(afterShutdown);
  });
});

describe('backtest thread: messages are validated in both directions', () => {
  test('the thread refuses a request that is not exactly { type: run, runId: uuid }', async () => {
    const worker = new Worker(WORKER_URL, {
      env: {
        TEST_WORKER_MODE: 'golden',
        [BACKTEST_MUTANT_VARIABLE]: resolveBacktestSource(),
      },
    });
    const events: unknown[] = [];
    const answered = new Promise<void>((resolve) => {
      worker.addEventListener('message', (message: MessageEvent) => {
        events.push(message.data);
        if (events.length === 1) worker.postMessage({ type: 'run', runId: 'not-a-uuid', extra: 1 });
        if (events.length === 2) resolve();
      });
    });
    await answered;
    worker.terminate();
    const refusal = BACKTEST_EVENT_SCHEMA.parse(events[1]);
    expect(refusal).toStrictEqual({
      type: 'failed',
      errorCode: BACKTEST_ERROR_CODE.BACKTEST_INVALID_REQUEST,
      isRecorded: false,
    });
  });

  test('the request schema is strict', () => {
    const valid = { type: 'run', runId: IN_MEMORY_RUN_ID };
    expect(BACKTEST_REQUEST_SCHEMA.safeParse(valid).success).toBe(true);
    expect(BACKTEST_REQUEST_SCHEMA.safeParse({ ...valid, databaseUrl: 'x' }).success).toBe(false);
    expect(BACKTEST_REQUEST_SCHEMA.safeParse({ type: 'run' }).success).toBe(false);
    expect(BACKTEST_REQUEST_SCHEMA.safeParse({ ...valid, runId: 'abc' }).success).toBe(false);
  });

  test('no event can carry the engine state, a result or a free text', () => {
    const completed = {
      type: 'completed',
      runId: IN_MEMORY_RUN_ID,
      processedCandles: 1,
      batches: 1,
      gapCandles: 0,
      phases: { load: 0, engine: 0, write: 0, metrics: 0 },
    };
    expect(BACKTEST_EVENT_SCHEMA.safeParse(completed).success).toBe(true);
    for (const extra of ['engineState', 'metrics', 'message', 'error', 'userId']) {
      expect(BACKTEST_EVENT_SCHEMA.safeParse({ ...completed, [extra]: 'x' }).success).toBe(false);
    }
    const failed = { type: 'failed', errorCode: 'NOT_A_KNOWN_CODE', isRecorded: true };
    expect(BACKTEST_EVENT_SCHEMA.safeParse(failed).success).toBe(false);
    expect(
      BACKTEST_EVENT_SCHEMA.safeParse({ type: 'progress', runId: IN_MEMORY_RUN_ID, progress: 101 })
        .success,
    ).toBe(false);
  });
});

describe('backtest thread: the API does not block while a backtest of 2 years runs', () => {
  test(
    'GET /v1/health answers in under 100 ms during the whole run',
    async () => {
      const router = createRouter({
        routes: createApiRoutes(buildApiRouteDependencies(() => Promise.resolve(true))),
        verifyAccessToken: () => Promise.reject(new Error('not used')),
        resolveUser: () => Promise.reject(new Error('not used')),
        rateLimiter: createRateLimiter({ now: () => Date.now() }),
        trustedProxyHops: 0,
        reportUnexpectedError: () => undefined,
      });
      const server = Bun.serve({
        port: 0,
        hostname: '127.0.0.1',
        fetch: (request) =>
          router({ request, socketAddress: '127.0.0.1', traceId: 'trace-health' }),
      });
      try {
        const rig = await buildRig({ mode: 'synthetic' });
        const latencies: number[] = [];
        let isRunning = true;
        const outcomePromise = rig.run().finally(() => {
          isRunning = false;
        });
        while (isRunning) {
          const startedAt = performance.now();
          const response = await fetch(`http://127.0.0.1:${server.port}${HEALTH_PATH}`);
          expect(response.status).toBe(200);
          latencies.push(performance.now() - startedAt);
          await Bun.sleep(5);
        }
        const outcome = await outcomePromise;
        expect(outcome.status).toBe('completed');
        expect(latencies.length).toBeGreaterThan(10);
        expect(Math.max(...latencies)).toBeLessThan(HEALTH_BUDGET_MILLISECONDS);
      } finally {
        await server.stop(true);
      }
    },
    GENEROUS_TIMEOUT_MILLISECONDS,
  );
});
