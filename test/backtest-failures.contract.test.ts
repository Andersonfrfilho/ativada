// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, test } from 'bun:test';

import { BACKTEST_ERROR_CODE } from '../apps/api-cryptoada/src/backtest/backtest.constant.js';
import { LEAD_IN_CANDLES, runGolden } from './fixtures/backtest/backtest-scenarios.fixture.js';
import {
  createCountingEngine,
  engineRefusal,
} from './fixtures/backtest/counting-engine.fixture.js';
import { GOLDEN_DATASETS } from './fixtures/strategy-engine/production/engine-golden.fixture.js';

const [HOURLY] = GOLDEN_DATASETS;
const SECRET = 's3cr3t-p4ss';
const FAILURE_STEP = 350;
const BATCH_SIZE = 100;
const TEN_MINUTES = 600_000;

function dataset(): NonNullable<typeof HOURLY> {
  if (HOURLY === undefined) throw new Error('conjunto real ausente');
  return HOURLY;
}

function expectFailed(result: Awaited<ReturnType<typeof runGolden>>, errorCode: string): void {
  expect(result.outcome.status).toBe('failed');
  if (result.outcome.status === 'failed') expect<string>(result.outcome.errorCode).toBe(errorCode);
  expect(result.memory.state.status).toBe('failed');
  expect(result.memory.state.errorCode).toBe(errorCode);
}

describe('backtest use case: typed failures before the first step', () => {
  test('a period with no candle at all fails NO_CANDLES and writes nothing', async () => {
    const counting = createCountingEngine();
    const result = await runGolden(
      dataset(),
      { candles: [], periodStart: 1, periodEnd: 2 },
      {
        engine: counting.engine,
      },
    );
    expectFailed(result, BACKTEST_ERROR_CODE.NO_CANDLES);
    expect(counting.steps()).toBe(0);
    expect(result.memory.state.commits).toBe(0);
  });

  test('candles only in the warm-up, none in the period, also fail NO_CANDLES', async () => {
    const warmupOnly = dataset().candles.slice(0, LEAD_IN_CANDLES);
    const periodStart = dataset().candles[LEAD_IN_CANDLES]?.openTime ?? 0;
    const counting = createCountingEngine();
    const result = await runGolden(
      dataset(),
      { candles: warmupOnly, periodStart, periodEnd: periodStart + 10 * 3_600_000 },
      { engine: counting.engine },
    );
    expectFailed(result, BACKTEST_ERROR_CODE.NO_CANDLES);
    expect(counting.steps()).toBe(0);
  });

  test('fewer candles than the warm-up fails INSUFFICIENT_HISTORY with the count, before any step', async () => {
    const periodStart = dataset().candles[LEAD_IN_CANDLES]?.openTime ?? 0;
    const shortHistory = dataset().candles.slice(LEAD_IN_CANDLES - 94);
    const counting = createCountingEngine();
    const result = await runGolden(
      dataset(),
      {
        candles: shortHistory,
        periodStart,
        periodEnd: (dataset().candles.at(-1)?.closeTime ?? 0) + 1,
      },
      { engine: counting.engine },
    );
    expectFailed(result, BACKTEST_ERROR_CODE.INSUFFICIENT_HISTORY);
    if (result.outcome.status === 'failed') {
      expect(result.outcome.message).toContain('94 de 194');
    }
    expect(counting.steps()).toBe(0);
    expect(result.memory.state.commits).toBe(0);
  });

  test.each([
    ['run_hash', 'the stored run hash'],
    ['config_hash', 'the stored strategy version hash'],
  ] as const)(
    '%s that does not match the content fails HASH_MISMATCH before loading a candle',
    async (tamper) => {
      const counting = createCountingEngine();
      const result = await runGolden(dataset(), { tamper }, { engine: counting.engine });
      expectFailed(result, BACKTEST_ERROR_CODE.HASH_MISMATCH);
      expect(counting.steps()).toBe(0);
      expect(result.memory.calls.findCandles).toBe(0);
    },
  );

  test('a run that is not a backtest is refused, and a finished run is not run again', async () => {
    const wrongKind = await runGolden(dataset(), { runKind: 'live' });
    expectFailed(wrongKind, BACKTEST_ERROR_CODE.RUN_KIND_UNSUPPORTED);
    const finished = await runGolden(dataset(), { initialStatus: 'completed' });
    expect(finished.outcome.status).toBe('failed');
    if (finished.outcome.status === 'failed') {
      expect(finished.outcome.errorCode).toBe(BACKTEST_ERROR_CODE.RUN_NOT_RUNNABLE);
      expect(finished.outcome.isRecorded).toBe(false);
    }
    expect(finished.memory.state.status).toBe('completed');
  });

  test('a run that does not exist (or whose owner is not active) fails without touching anything', async () => {
    const { loadBacktestApi } = await import('./fixtures/backtest/backtest-api.fixture.js');
    const { runBacktest } = await loadBacktestApi();
    const memory = (await runGolden(dataset())).memory;
    const outcome = await runBacktest({ database: memory.database, runId: crypto.randomUUID() });
    expect(outcome).toMatchObject({
      status: 'failed',
      errorCode: BACKTEST_ERROR_CODE.RUN_NOT_FOUND,
      isRecorded: false,
    });
  });
});

describe('backtest use case: a failure in the middle keeps what was written and never leaves it running', () => {
  test('a refusal of the engine fails ENGINE_REJECTED_INPUT; the earlier batches stay', async () => {
    const counting = createCountingEngine({ atStep: FAILURE_STEP, error: engineRefusal() });
    const result = await runGolden(
      dataset(),
      {},
      { engine: counting.engine, batchSize: BATCH_SIZE },
    );
    expectFailed(result, BACKTEST_ERROR_CODE.ENGINE_REJECTED_INPUT);
    expect(result.memory.state.commits).toBe(3);
    expect(result.memory.state.checkpoint?.lastCandleTime).toBe(dataset().candles[299]?.openTime);
    expect(result.memory.state.results.equityPoints.size).toBe(300 - (LEAD_IN_CANDLES - 1));
  });

  test('an unexpected error becomes BACKTEST_UNEXPECTED and its text (a secret) never travels', async () => {
    const error = new Error(`connect postgres://user:${SECRET}@db.internal:5432/crypto failed`);
    const counting = createCountingEngine({ atStep: FAILURE_STEP, error });
    const result = await runGolden(
      dataset(),
      {},
      { engine: counting.engine, batchSize: BATCH_SIZE },
    );
    expectFailed(result, BACKTEST_ERROR_CODE.BACKTEST_UNEXPECTED);
    const everything = JSON.stringify({
      outcome: result.outcome,
      errorCode: result.memory.state.errorCode,
      log: result.memory.log,
    });
    expect(everything).not.toContain(SECRET);
    expect(everything).not.toContain('postgres://');
    expect(everything).not.toContain('db.internal');
  });

  test('a failure while committing the batch leaves no row of that batch and the checkpoint where it was', async () => {
    const result = await runGolden(
      dataset(),
      { hooks: { failure: { operation: 'saveCheckpoint', batch: 3 } } },
      { batchSize: BATCH_SIZE },
    );
    expectFailed(result, BACKTEST_ERROR_CODE.BACKTEST_UNEXPECTED);
    expect(result.memory.state.commits).toBe(2);
    expect(result.memory.state.checkpoint?.lastCandleTime).toBe(dataset().candles[199]?.openTime);
    const lastPersisted = Math.max(...result.memory.state.results.equityPoints.keys());
    expect(lastPersisted).toBe(dataset().candles[199]?.openTime ?? 0);
    expect(result.memory.log.filter((entry) => entry === 'rollback')).toHaveLength(1);
  });

  test('a failure that cannot even be recorded is reported as not recorded', async () => {
    const result = await runGolden(
      dataset(),
      { hooks: { failure: { operation: 'appendResults', batch: 1 }, isFailureUnrecordable: true } },
      { batchSize: BATCH_SIZE },
    );
    expect(result.outcome.status).toBe('failed');
    if (result.outcome.status === 'failed') expect(result.outcome.isRecorded).toBe(false);
    expect(result.memory.state.status).toBe('running');
  });
});

describe('backtest use case: an open candle never enters', () => {
  test('with the clock inside the last candle, the last candle is neither stepped nor written', async () => {
    const candles = dataset().candles;
    const last = candles.at(-1);
    if (last === undefined) throw new Error('sem candles');
    const counting = createCountingEngine();
    const result = await runGolden(
      dataset(),
      {},
      { engine: counting.engine, now: () => last.openTime + TEN_MINUTES },
    );
    expect(result.outcome.status).toBe('completed');
    expect(counting.steps()).toBe(candles.length - 1);
    expect(Math.max(...counting.openTimes)).toBe(candles[candles.length - 2]?.openTime ?? 0);
    expect(result.memory.state.results.equityPoints.has(last.openTime)).toBe(false);
  });
});
