// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, test } from 'bun:test';

import { BACKTEST_ERROR_CODE } from '../apps/api-ativada/src/backtest/backtest.constant.js';
import {
  createEngine,
  createStrategyVersion,
  ENGINE_TIMEFRAME_DURATION_MILLISECONDS,
  type EngineCandle,
  type StoredSentimentObservation,
} from '../packages/strategy-engine/src/index.js';
import {
  buildGoldenMemory,
  digestOfRun,
  LEAD_IN_CANDLES,
  runGolden,
  runInMemory,
} from './fixtures/backtest/backtest-scenarios.fixture.js';
import { createCountingEngine } from './fixtures/backtest/counting-engine.fixture.js';
import { expectedRowsOf } from './fixtures/backtest/expected-rows.fixture.js';
import type { InMemoryBacktest } from './fixtures/backtest/in-memory-backtest-database.fixture.js';
import type { InMemoryHooks } from './fixtures/backtest/in-memory-backtest-types.fixture.js';
import {
  persistedRowsOf,
  sortedLikePersisted,
} from './fixtures/backtest/persisted-rows.fixture.js';
import { loadClassicScoreboard } from './fixtures/strategy-engine/engine-scenarios.fixture.js';
import { runSteps } from './fixtures/strategy-engine/engine-contract-runs.fixture.js';
import {
  buildClassicScenario,
  GOLDEN_DATASETS,
} from './fixtures/strategy-engine/production/engine-golden.fixture.js';

const [HOURLY] = GOLDEN_DATASETS;
const HOUR = ENGINE_TIMEFRAME_DURATION_MILLISECONDS['1h'];
const BATCH_SIZE = 100;

function hourly(): NonNullable<typeof HOURLY> {
  if (HOURLY === undefined) throw new Error('conjunto real ausente');
  return HOURLY;
}

function withHole(candles: readonly EngineCandle[], start: number, length: number): EngineCandle[] {
  return candles.filter((_candle, index) => index < start || index >= start + length);
}

type DirectRun = ReturnType<typeof runSteps>;

function directRunWithHole(start: number, length: number): DirectRun {
  const scenario = buildClassicScenario(hourly());
  return runSteps({
    engine: createEngine(),
    scenario: { ...scenario, candles: withHole(hourly().candles, start, length) },
  });
}

function reasonsOf(run: DirectRun): string[] {
  return run.flatMap((step) => [
    ...step.result.decisions.closedPositions.map((closed) => closed.exitReason),
    ...step.result.decisions.orders.flatMap((order) =>
      order.reason === null ? [] : [order.reason],
    ),
  ]);
}

// Procura onde o buraco muda o que a carteira faz (saída por lacuna ou ordem caducada), com o motor direto.
function findHoleThatMatters(length: number): number {
  for (let start = 200; start < 420; start += 7) {
    if (reasonsOf(directRunWithHole(start, length)).includes('gap')) return start;
  }
  throw new Error('nenhum buraco relevante achado no conjunto real');
}

describe('backtest use case: a gap in the candles is a CONFIRMED gap, never skipped in silence', () => {
  const HOLE_LENGTH = 5;
  const holeStart = findHoleThatMatters(HOLE_LENGTH);

  test('the engine receives the exact count and the result equals the direct run with the gap declared', async () => {
    const candles = withHole(hourly().candles, holeStart, HOLE_LENGTH);
    const result = await runGolden(hourly(), { candles }, { batchSize: BATCH_SIZE });
    expect(result.outcome.status).toBe('completed');
    if (result.outcome.status !== 'completed') throw new Error('esperado completed');
    expect(result.outcome.gapCandles).toBe(HOLE_LENGTH);
    expect(result.outcome.processedCandles).toBe(candles.length);
    const expected = sortedLikePersisted(expectedRowsOf(directRunWithHole(holeStart, HOLE_LENGTH)));
    const persisted = persistedRowsOf(result.memory);
    expect(persisted.equityPoints).toStrictEqual(expected.equityPoints);
    expect(persisted.closedPositions).toStrictEqual(expected.closedPositions);
    expect(persisted.orderStatuses).toStrictEqual(expected.orderStatuses);
    expect(
      persisted.closedPositions.some((row) => (row as { exitReason: string }).exitReason === 'gap'),
    ).toBe(true);
  });

  test('the gap changes the result: without it the same candles would be a different run', async () => {
    const whole = await runGolden(hourly(), {}, { batchSize: BATCH_SIZE });
    const holed = await runGolden(
      hourly(),
      { candles: withHole(hourly().candles, holeStart, HOLE_LENGTH) },
      { batchSize: BATCH_SIZE },
    );
    expect(digestOfRun(holed.memory)).not.toBe(digestOfRun(whole.memory));
  });

  test('a gap that straddles a batch boundary is still declared exactly', async () => {
    const candles = withHole(hourly().candles, 290, 4);
    const result = await runGolden(hourly(), { candles }, { batchSize: BATCH_SIZE });
    expect(result.outcome.status).toBe('completed');
    if (result.outcome.status === 'completed') expect(result.outcome.gapCandles).toBe(4);
  });
});

describe('backtest use case: cancelling between batches', () => {
  test('stops, keeps what was written, does not fail, and the status stays cancelled', async () => {
    const counting = createCountingEngine();
    const hooks: InMemoryHooks = {
      afterCommit: (batch, controls) => {
        if (batch === 2) controls.cancel();
      },
    };
    const result = await runGolden(
      hourly(),
      { hooks },
      { engine: counting.engine, batchSize: BATCH_SIZE },
    );
    expect(result.outcome.status).toBe('cancelled');
    expect(result.memory.state.status).toBe('cancelled');
    expect(result.memory.state.errorCode).toBeUndefined();
    expect(result.memory.state.commits).toBe(2);
    expect(result.memory.state.checkpoint?.lastCandleTime).toBe(hourly().candles[199]?.openTime);
    expect(Math.max(...result.memory.state.results.equityPoints.keys())).toBe(
      hourly().candles[199]?.openTime ?? 0,
    );
    expect(result.memory.state.metrics).toBeUndefined();
    expect(counting.steps()).toBe(300);
  });

  test('a run cancelled before it starts ends cancelled without a single step', async () => {
    const counting = createCountingEngine();
    const result = await runGolden(
      hourly(),
      { initialStatus: 'cancelled' },
      { engine: counting.engine },
    );
    expect(result.outcome.status).toBe('cancelled');
    expect(counting.steps()).toBe(0);
    expect(result.memory.state.commits).toBe(0);
  });
});

describe('backtest use case: resuming from the checkpoint gives the result of the continuous run', () => {
  async function continuousDigest(batchSize: number): Promise<string> {
    const continuous = await runGolden(hourly(), {}, { batchSize });
    expect(continuous.outcome.status).toBe('completed');
    return digestOfRun(continuous.memory);
  }

  async function crashAfter(batches: number, batchSize: number): Promise<InMemoryBacktest> {
    const hooks: InMemoryHooks = {
      failure: { operation: 'appendResults', batch: batches + 1 },
      isFailureUnrecordable: true,
    };
    const memory = buildGoldenMemory(hourly(), { hooks });
    const crashed = await runInMemory(memory, { batchSize });
    expect(crashed.outcome.status).toBe('failed');
    expect(memory.state.status).toBe('running');
    expect(memory.state.commits).toBe(batches);
    hooks.isFailureUnrecordable = false;
    return memory;
  }

  test.each([
    [1, BATCH_SIZE],
    [2, BATCH_SIZE],
    [3, BATCH_SIZE],
    [4, BATCH_SIZE],
  ])(
    'a crash after batch %i (size %i) resumes into the identical result',
    async (batches, size) => {
      const expected = await continuousDigest(size);
      const memory = await crashAfter(batches, size);
      const counting = createCountingEngine();
      const resumed = await runInMemory(memory, { batchSize: size, engine: counting.engine });
      expect(resumed.outcome.status).toBe('completed');
      expect(digestOfRun(memory)).toBe(expected);
      expect(counting.steps()).toBe(hourly().candles.length - batches * size);
      expect(Math.min(...counting.openTimes)).toBe(hourly().candles[batches * size]?.openTime ?? 0);
    },
  );

  test('resuming with another batch size does not matter either', async () => {
    const expected = await continuousDigest(BATCH_SIZE);
    const memory = await crashAfter(2, BATCH_SIZE);
    const resumed = await runInMemory(memory, { batchSize: 37 });
    expect(resumed.outcome.status).toBe('completed');
    expect(digestOfRun(memory)).toBe(expected);
  });

  test('cuts all along the first 12 batches, including one with a position open, all identical', async () => {
    const expected = await continuousDigest(25);
    let hasOpenPositionAtCut = false;
    for (let batches = 1; batches <= 12; batches += 1) {
      const memory = await crashAfter(batches, 25);
      const wallet = (memory.state.checkpoint?.engineState as { wallet: { position: unknown } })
        .wallet;
      if (wallet.position !== null) hasOpenPositionAtCut = true;
      await runInMemory(memory, { batchSize: 25 });
      expect(digestOfRun(memory)).toBe(expected);
    }
    expect(hasOpenPositionAtCut).toBe(true);
  });

  test('a crash at the very end (everything written, not yet completed) resumes with no candle left', async () => {
    const expected = await continuousDigest(BATCH_SIZE);
    const hooks: InMemoryHooks = {
      failure: { operation: 'completeRun', batch: Math.ceil(hourly().candles.length / BATCH_SIZE) },
      isFailureUnrecordable: true,
    };
    const memory = buildGoldenMemory(hourly(), { hooks });
    await runInMemory(memory, { batchSize: BATCH_SIZE });
    expect(memory.state.status).toBe('running');
    hooks.isFailureUnrecordable = false;
    const counting = createCountingEngine();
    const resumed = await runInMemory(memory, { batchSize: BATCH_SIZE, engine: counting.engine });
    expect(resumed.outcome.status).toBe('completed');
    expect(counting.steps()).toBe(0);
    expect(digestOfRun(memory)).toBe(expected);
  });

  test.each(['configHash', 'runHash'] as const)(
    'a checkpoint whose %s is another (and coherent) is refused, not trusted',
    async (field) => {
      const memory = await crashAfter(2, BATCH_SIZE);
      const engineState = memory.state.checkpoint?.engineState as {
        configHash: string;
        runHash: string;
        wallet: { configHash: string; runHash: string };
      };
      engineState[field] = 'f'.repeat(64);
      engineState.wallet[field] = 'f'.repeat(64);
      const resumed = await runInMemory(memory, { batchSize: BATCH_SIZE });
      expect(resumed.outcome.status).toBe('failed');
      expect(memory.state.errorCode).toBe(BACKTEST_ERROR_CODE.ENGINE_STATE_UNUSABLE);
      expect(memory.state.status).toBe('failed');
    },
  );

  test('a checkpoint whose last candle is not the one in the state is refused', async () => {
    const memory = await crashAfter(2, BATCH_SIZE);
    if (memory.state.checkpoint === undefined) throw new Error('sem checkpoint');
    memory.state.checkpoint.lastCandleTime -= 3_600_000;
    const resumed = await runInMemory(memory, { batchSize: BATCH_SIZE });
    expect(resumed.outcome.status).toBe('failed');
    expect(memory.state.errorCode).toBe(BACKTEST_ERROR_CODE.ENGINE_STATE_UNUSABLE);
  });

  test('a run left running with no checkpoint starts over from the lead-in', async () => {
    const expected = await continuousDigest(BATCH_SIZE);
    const memory = buildGoldenMemory(hourly(), { initialStatus: 'running' });
    const result = await runInMemory(memory, { batchSize: BATCH_SIZE });
    expect(result.outcome.status).toBe('completed');
    expect(digestOfRun(memory)).toBe(expected);
  });
});

const SENTIMENT_STRATEGY = createStrategyVersion({
  ...loadClassicScoreboard(),
  rules: [
    ...(loadClassicScoreboard().rules ?? []),
    { id: 'fear-greed', kind: 'fear_greed', fearAtOrBelow: 25, greedAtOrAbove: 75 },
  ],
});

describe('backtest use case: sentiment is the one available at each close, inserted by then', () => {
  const FEAR = 20;

  function observation(params: {
    observedAt: number;
    createdAt: number;
  }): StoredSentimentObservation {
    return { value: FEAR, source: 'alternative.me', ...params };
  }

  test('an observation inserted after the close is not used at that close, and is from the next one on', async () => {
    const candles = hourly().candles;
    const observedAt = candles[250]?.closeTime ?? 0;
    const createdAt = candles[260]?.closeTime ?? 0;
    const result = await runGolden(hourly(), {
      strategy: SENTIMENT_STRATEGY,
      sentiment: [observation({ observedAt, createdAt })],
    });
    const signals = [...result.memory.state.results.signals.values()];
    const at = (index: number): unknown =>
      signals.find((signal) => signal.candleTime === candles[index]?.openTime)
        ?.sentimentObservation;
    expect(at(255)).toBeUndefined();
    expect(at(259)).toBeUndefined();
    expect(at(260)).toStrictEqual({ value: FEAR, observedAt, source: 'alternative.me' });
    expect(at(280)).toStrictEqual({ value: FEAR, observedAt, source: 'alternative.me' });
  });

  test('an observation of another source never reaches the engine', async () => {
    const candles = hourly().candles;
    const stranger = { ...observation({ observedAt: 1, createdAt: 1 }), source: 'another.source' };
    const result = await runGolden(hourly(), {
      strategy: SENTIMENT_STRATEGY,
      sentiment: [stranger],
    });
    const used = [...result.memory.state.results.signals.values()].filter(
      (signal) => signal.sentimentObservation !== undefined,
    );
    expect(used).toHaveLength(0);
    expect(candles.length).toBeGreaterThan(LEAD_IN_CANDLES);
    expect(HOUR).toBe(3_600_000);
  });
});
