// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, test } from 'bun:test';

import { EXIT_CODE, TASK_NAME } from '../apps/cron-cryptoada/src/cron.constant.js';
import { createCronLogger } from '../apps/cron-cryptoada/src/logging/cron-logger.js';
import {
  createSyncFearGreedTask,
  type SyncFearGreedSummary,
} from '../apps/cron-cryptoada/src/market/sync-fear-greed.task.js';
import { runCronTasks, type CronTask } from '../apps/cron-cryptoada/src/run-cron-tasks.js';
import { selectCronTasks } from '../apps/cron-cryptoada/src/select-cron-tasks.js';
import type { FearGreedEntry } from '../packages/database/src/index.js';
import { createFearGreedClient } from '../packages/market-data/src/index.js';
import { createFakeClock } from './fixtures/fake-binance.fixture.js';
import { createInMemorySentimentRepository } from './fixtures/in-memory-sentiment-repository.fixture.js';
import {
  createFearGreedFetch,
  FEAR_GREED_BASE_URL,
  loadRealFearGreedResponse,
  type FearGreedReply,
} from './fixtures/fear-greed.fixture.js';

const REFRESH_DAYS = 14;
const SOURCE_FAILURE: FearGreedReply = { status: 503, body: {} };

const EXISTING_ROWS: readonly FearGreedEntry[] = [
  { date: '2026-10-09', fearGreed: 30, classification: 'Fear' },
  { date: '2026-10-10', fearGreed: 40, classification: 'Fear' },
];

async function buildHarness(params: {
  readonly seed?: readonly FearGreedEntry[];
  readonly script?: readonly FearGreedReply[];
}): Promise<{
  readonly run: () => Promise<SyncFearGreedSummary>;
  readonly task: CronTask;
  readonly repository: ReturnType<typeof createInMemorySentimentRepository>;
  readonly limits: () => (string | null)[];
  readonly lines: string[];
}> {
  const script = params.script ?? [{ status: 200, body: await loadRealFearGreedResponse() }];
  const scripted = createFearGreedFetch(script);
  const repository = createInMemorySentimentRepository(params.seed);
  const lines: string[] = [];
  const run = createSyncFearGreedTask({
    repository,
    client: createFearGreedClient({
      baseUrl: FEAR_GREED_BASE_URL,
      fetchImplementation: scripted.fetchImplementation,
      sleep: createFakeClock(0).sleep,
      maxAttempts: 2,
    }),
    logger: createCronLogger({ appName: 'cron-cryptoada', write: (line) => void lines.push(line) }),
    refreshDays: REFRESH_DAYS,
  });
  return {
    run,
    task: { name: TASK_NAME.SYNC_FEAR_GREED, run },
    repository,
    limits: () => scripted.calls.map((call) => call.url.searchParams.get('limit')),
    lines,
  };
}

describe('sync-fear-greed: how much history is requested', () => {
  test('an empty table asks for the whole history (limit=0), exactly once', async () => {
    const harness = await buildHarness({});
    const summary = await harness.run();
    expect(harness.limits()).toStrictEqual(['0']);
    expect(harness.repository.stored()).toHaveLength(5);
    expect(summary).toMatchObject({ failures: 0, fullHistory: 1, fetched: 5, upserted: 5 });
  });

  test('a table with data asks only for the refresh window', async () => {
    const harness = await buildHarness({ seed: EXISTING_ROWS });
    const summary = await harness.run();
    expect(harness.limits()).toStrictEqual([String(REFRESH_DAYS)]);
    expect(summary).toMatchObject({ failures: 0, fullHistory: 0 });
  });

  test('the value of the current day is UPDATED, not skipped, and there are no duplicates', async () => {
    const harness = await buildHarness({ seed: EXISTING_ROWS });
    await harness.run();
    await harness.run();
    const stored = harness.repository.stored();
    expect(stored.map((entry) => entry.date)).toStrictEqual([
      '2026-10-06',
      '2026-10-07',
      '2026-10-08',
      '2026-10-09',
      '2026-10-10',
    ]);
    expect(stored.find((entry) => entry.date === '2026-10-10')).toStrictEqual({
      date: '2026-10-10',
      fearGreed: 64,
      classification: 'Greed',
    });
    expect(stored.find((entry) => entry.date === '2026-10-09')?.fearGreed).toBe(59);
  });
});

describe('sync-fear-greed: a failing source never touches stored data', () => {
  test.each([
    ['HTTP 5xx', SOURCE_FAILURE],
    [
      'metadata.error',
      { status: 200, body: { name: 'x', data: [], metadata: { error: 'Limit exceeded' } } },
    ],
    ['malformed body', { status: 200, rawBody: 'not json' }],
  ] as const)('%s -> the task rejects and the rows are exactly as before', async (_name, reply) => {
    const harness = await buildHarness({ seed: EXISTING_ROWS, script: [reply] });
    const failure = await harness.run().catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(Error);
    expect(harness.repository.stored()).toStrictEqual(EXISTING_ROWS);
    expect(harness.repository.upsertCalls()).toBe(0);
  });

  test('the cron exits 1 and logs only the error name', async () => {
    const harness = await buildHarness({ script: [SOURCE_FAILURE] });
    const lines: string[] = [];
    const logger = createCronLogger({
      appName: 'cron-cryptoada',
      write: (l) => void lines.push(l),
    });
    expect(await runCronTasks([harness.task], logger)).toBe(EXIT_CODE.FAILURE);
    expect(lines.join('')).toContain('MarketDataHttpError');
    expect(harness.repository.stored()).toHaveLength(0);
  });
});

describe('sync-fear-greed: CRON_TASKS', () => {
  test('selects the task by name and skips it otherwise', async () => {
    const harness = await buildHarness({});
    const other: CronTask = {
      name: TASK_NAME.BACKFILL_CANDLES,
      run: () => Promise.resolve({ failures: 0 }),
    };
    const tasks = [other, harness.task];
    const selected = selectCronTasks({ tasks, names: [TASK_NAME.SYNC_FEAR_GREED] });
    expect(selected.map((task) => task.name)).toStrictEqual(['sync-fear-greed']);
    expect(selectCronTasks({ tasks, names: [TASK_NAME.BACKFILL_CANDLES] })).toStrictEqual([other]);
  });
});
