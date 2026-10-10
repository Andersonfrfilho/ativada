// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, test } from 'bun:test';

import {
  advanceCandle,
  appendDecisions,
  createBatchBuffer,
  createPositionTracker,
  createSentimentPicker,
  toRunResultRows,
} from '../packages/run-recording/src/index.js';
import {
  createEngine,
  ENGINE_TIMEFRAME_DURATION_MILLISECONDS,
  type EngineCandle,
  type EngineCommand,
} from '../packages/strategy-engine/src/index.js';
import {
  appendRows,
  createEmptyResults,
  snapshotResults,
} from './fixtures/backtest/in-memory-backtest-results.fixture.js';
import {
  expectedGoalOutcome as expectedOutcome,
  GOAL_SPECS as SPECS,
  type Expected,
  type Spec,
} from './fixtures/live/goal-expected-outcome.fixture.js';
import type { InMemoryLive } from './fixtures/live/in-memory-live-database.fixture.js';
import {
  buildLive,
  classicSetup,
  createTestEvaluator,
  LEAD_IN_CANDLES,
  tickUntilIdle,
} from './fixtures/live/live-scenarios.fixture.js';
import {
  REAL_DATASETS,
  CLASSIC_STRATEGY,
  type RealDataset,
} from './fixtures/strategy-engine/signal/classic-signals.fixture.js';

const ETH_DAILY = REAL_DATASETS[1] as RealDataset;
const DAY = ENGINE_TIMEFRAME_DURATION_MILLISECONDS['1d'];
const GOAL_ID = '018f0000-0000-7000-8000-0000000000cc';

// A referência do que deve ficar gravado: o passo de produção em laço direto, com a saída por meta no candle do desfecho e
// o fim quando a carteira se assenta depois dele.
function referenceRun(expected: Expected): {
  rows: Record<string, readonly unknown[]>;
  steps: number;
} {
  const setup = classicSetup(ETH_DAILY);
  const engine = createEngine();
  let state = engine.createInitialState({ strategy: CLASSIC_STRATEGY, run: setup });
  const buffer = createBatchBuffer();
  const tracker = createPositionTracker(null);
  const pickSentiment = createSentimentPicker({ observations: [], source: 'alternative.me' });
  let previousOpenTime: number | null = null;
  let steps = 0;
  for (const [index, candle] of ETH_DAILY.candles.entries()) {
    const commands: EngineCommand[] =
      index === expected.candleIndex
        ? (['exit_position', 'halt'] as const).map((kind) => ({
            commandId: `goal:LIVE:${expected.outcome}:${kind}`,
            issuedAt: candle.closeTime,
            kind,
            reason: {
              reached: 'goal_reached',
              stopped: 'goal_max_loss',
              expired: 'goal_expired',
            }[expected.outcome] as EngineCommand['reason'],
          }))
        : [];
    const advanced = advanceCandle({
      engine,
      strategy: CLASSIC_STRATEGY,
      setup,
      state,
      candle,
      previousOpenTime,
      durationMilliseconds: DAY,
      pickSentiment,
      commands: commands.length === 0 ? undefined : commands,
    });
    appendDecisions({ buffer, decisions: advanced.result.decisions, tracker });
    state = advanced.result.state;
    previousOpenTime = candle.openTime;
    steps += 1;
    if (
      index >= expected.candleIndex &&
      state.wallet.position === null &&
      state.wallet.pendingOrder === null
    ) {
      break;
    }
  }
  const stage = createEmptyResults();
  appendRows(stage, toRunResultRows(buffer));
  return { rows: snapshotResults(stage), steps };
}

function withLiveId(rows: Record<string, readonly unknown[]>, live: InMemoryLive): string {
  return JSON.stringify(rows).replaceAll('goal:LIVE:', `goal:${live.runId}:`);
}

function alerting(): { now: () => number; maxAgeCandles: number } {
  return { now: () => ETH_DAILY.candles.at(-1)?.closeTime ?? 0, maxAgeCandles: 1_000_000 };
}

async function runToTheEnd(spec: Spec): Promise<{ live: InMemoryLive; expected: Expected }> {
  const expected = expectedOutcome(spec);
  const live = buildLive({ dataset: ETH_DAILY, overrides: { goal: { goalId: GOAL_ID, spec } } });
  const { evaluator } = await createTestEvaluator(live, { alerting: alerting() });
  await tickUntilIdle(evaluator);
  return { live, expected };
}

describe('simulação ao vivo atrelada a uma meta: os três desfechos', () => {
  test.each(['reached', 'stopped', 'expired'] as const)('%s', async (name) => {
    const { live, expected } = await runToTheEnd(SPECS[name] as Spec);
    expect(expected.outcome).toBe(name);
    const candle = ETH_DAILY.candles[expected.candleIndex] as EngineCandle;
    expect(live.state.goalOutcome).toStrictEqual({
      outcome: expected.runOutcome,
      candleTime: candle.openTime,
    });
    expect(live.state.goalOutcomeWrites).toBe(1);
    expect(live.state.status).toBe('completed');
    const reference = referenceRun(expected);
    expect(live.state.commits).toBe(reference.steps);
    expect(JSON.stringify(live.snapshot())).toBe(withLiveId(reference.rows, live));
  });

  test('o desfecho vende a posição e para de entrar: depois dele nenhuma ordem de entrada', async () => {
    const { live, expected } = await runToTheEnd(SPECS['reached'] as Spec);
    const candle = ETH_DAILY.candles[expected.candleIndex] as EngineCandle;
    const commands = live.snapshot()['commands'] as {
      commandId: string;
      kind: string;
      status: string;
    }[];
    expect(commands.map((entry) => entry.kind).sort()).toStrictEqual(['exit_position', 'halt']);
    expect(commands.every((entry) => entry.status === 'applied')).toBe(true);
    const orders = live.snapshot()['orders'] as {
      purpose: string;
      createdCandleTime: number;
    }[];
    const entriesAfter = orders.filter(
      (order) => order.purpose === 'entry' && order.createdCandleTime > candle.openTime,
    );
    expect(entriesAfter).toStrictEqual([]);
  });

  test('um alerta GOAL por desfecho, com mercado e meta', async () => {
    const { live, expected } = await runToTheEnd(SPECS['stopped'] as Spec);
    const goalAlerts = [...live.state.alerts.values()].filter((alert) => alert.side === 'GOAL');
    expect(goalAlerts).toHaveLength(1);
    expect(goalAlerts[0]).toMatchObject({
      candleTime: (ETH_DAILY.candles[expected.candleIndex] as EngineCandle).openTime,
      payload: {
        symbol: 'ETHUSDT',
        timeframe: '1d',
        outcome: 'goal_stopped',
        targetRate: '5',
        maxLossRate: '0.002',
        horizonDays: 90,
        initialBalance: '10000',
      },
    });
  });

  test('sem alerta ligado (Telegram desligado) o desfecho é gravado e nada é enfileirado', async () => {
    const spec = SPECS['expired'] as Spec;
    const live = buildLive({ dataset: ETH_DAILY, overrides: { goal: { goalId: GOAL_ID, spec } } });
    const { evaluator } = await createTestEvaluator(live);
    await tickUntilIdle(evaluator);
    expect(live.state.goalOutcome?.outcome).toBe('goal_expired');
    expect([...live.state.alerts.values()].filter((alert) => alert.side === 'GOAL')).toStrictEqual(
      [],
    );
  });

  test('execução concluída não anda mais: candle novo não gera passo', async () => {
    const { live } = await runToTheEnd(SPECS['expired'] as Spec);
    const commits = live.state.commits;
    const last = ETH_DAILY.candles.at(-1) as EngineCandle;
    live.addCandles([{ ...last, openTime: last.openTime + DAY, closeTime: last.closeTime + DAY }]);
    const { evaluator } = await createTestEvaluator(live);
    expect((await tickUntilIdle(evaluator)).steps).toBe(0);
    expect(live.state.commits).toBe(commits);
  });
});

describe('reinício no meio da meta: nem o desfecho nem o alerta se repetem', () => {
  async function restartAfterTheOutcome(name: 'reached' | 'stopped' | 'expired'): Promise<{
    live: InMemoryLive;
    expected: Expected;
  }> {
    const spec = SPECS[name] as Spec;
    const expected = expectedOutcome(spec);
    const outcomeCommit = expected.candleIndex - LEAD_IN_CANDLES + 1 + LEAD_IN_CANDLES;
    const live = buildLive({
      dataset: ETH_DAILY,
      overrides: {
        goal: { goalId: GOAL_ID, spec },
        hooks: {
          afterCommit: (commit) => {
            if (commit === outcomeCommit) live.state.isHeartbeatExpired = true;
          },
        },
      },
    });
    const first = await createTestEvaluator(live, {
      instanceId: 'worker-a',
      alerting: alerting(),
      maxStepsPerPass: 1,
    });
    for (let tick = 0; tick < outcomeCommit + 2; tick += 1) await first.evaluator.tick();
    expect(live.state.goalOutcome?.outcome).toBe(expected.runOutcome);
    const second = await createTestEvaluator(live, {
      instanceId: 'worker-b',
      alerting: alerting(),
    });
    await tickUntilIdle(second.evaluator);
    return { live, expected };
  }

  test.each(['reached', 'stopped', 'expired'] as const)(
    '%s: o worker novo retoma e o resultado é o da execução ininterrupta',
    async (name) => {
      const { live, expected } = await restartAfterTheOutcome(name);
      expect(live.state.status).toBe('completed');
      expect(live.state.goalOutcomeWrites).toBe(1);
      expect([...live.state.alerts.values()].filter((alert) => alert.side === 'GOAL')).toHaveLength(
        1,
      );
      expect(JSON.stringify(live.snapshot())).toBe(withLiveId(referenceRun(expected).rows, live));
    },
  );
});
