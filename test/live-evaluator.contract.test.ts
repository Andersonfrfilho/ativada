// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, test } from 'bun:test';

import { canonicalJson } from '../packages/strategy-engine/src/index.js';
import {
  buildLive,
  classicSetup,
  createTestEvaluator,
  LEAD_IN_CANDLES,
  postgresCrash,
  runReference,
  tickUntilIdle,
} from './fixtures/live/live-scenarios.fixture.js';
import type { InMemoryLive } from './fixtures/live/in-memory-live-database.fixture.js';
import {
  REAL_DATASETS,
  type RealDataset,
} from './fixtures/strategy-engine/signal/classic-signals.fixture.js';

function requireDataset(index: number): RealDataset {
  const dataset = REAL_DATASETS[index];
  if (dataset === undefined) throw new Error('conjunto real ausente');
  return dataset;
}

const BTC_HOURLY = requireDataset(0);
const ETH_DAILY = requireDataset(1);
const TOTAL_CANDLES = BTC_HOURLY.candles.length;
const PAGE_OF_STEPS = 120;
const CRASH_POINTS = [1, 2, LEAD_IN_CANDLES, LEAD_IN_CANDLES + 1, 300, TOTAL_CANDLES];

function expectEqualToTheContinuousRun(live: InMemoryLive): void {
  const reference = runReference({
    setup: classicSetup(BTC_HOURLY),
    candles: BTC_HOURLY.candles,
  });
  expect(live.snapshot()).toStrictEqual(reference.rows);
  expect(canonicalJson(live.state.checkpoint?.engineState ?? null)).toBe(reference.engineState);
  expect(live.state.checkpoint?.lastCandleTime).toBe(reference.lastCandleTime);
}

describe('avaliador ao vivo: um passo por candle fechado', () => {
  test('do aquecimento ao último candle, e o gravado é o do motor rodado direto', async () => {
    const live = buildLive({ dataset: BTC_HOURLY });
    const { evaluator } = await createTestEvaluator(live, { maxStepsPerPass: PAGE_OF_STEPS });
    const totals = await tickUntilIdle(evaluator);
    expect(totals.claimed).toBe(1);
    expect(totals.steps).toBe(TOTAL_CANDLES);
    expect(live.state.commits).toBe(TOTAL_CANDLES);
    expect(live.state.status).toBe('running');
    expect(live.state.claimedBy).toBe('worker-test');
    expectEqualToTheContinuousRun(live);
  });

  test('cada passo é UMA transação: estado, linhas e último candle andam juntos', async () => {
    const checkpoints: (number | undefined)[] = [];
    const live = buildLive({
      dataset: BTC_HOURLY,
      overrides: {
        hooks: {
          afterCommit: () => void checkpoints.push(live.state.checkpoint?.lastCandleTime),
        },
      },
    });
    const { evaluator } = await createTestEvaluator(live);
    await tickUntilIdle(evaluator);
    expect(checkpoints).toStrictEqual(BTC_HOURLY.candles.map((candle) => candle.openTime));
  });

  test('candle que chega depois entra no passo seguinte e o resultado é o do fluxo contínuo', async () => {
    const early = BTC_HOURLY.candles.slice(0, 300);
    const live = buildLive({ dataset: BTC_HOURLY, candles: early });
    const { evaluator } = await createTestEvaluator(live);
    await tickUntilIdle(evaluator);
    expect(live.state.commits).toBe(early.length);
    live.addCandles(BTC_HOURLY.candles.slice(300, 301));
    expect((await tickUntilIdle(evaluator)).steps).toBe(1);
    live.addCandles(BTC_HOURLY.candles.slice(301));
    await tickUntilIdle(evaluator);
    expectEqualToTheContinuousRun(live);
  });

  test('ronda sem candle novo não grava nada', async () => {
    const live = buildLive({ dataset: BTC_HOURLY });
    const { evaluator } = await createTestEvaluator(live);
    await tickUntilIdle(evaluator);
    const before = live.snapshot();
    const commits = live.state.commits;
    const summary = await evaluator.tick();
    expect(summary.steps).toBe(0);
    expect(live.state.commits).toBe(commits);
    expect(live.snapshot()).toStrictEqual(before);
  });

  test('candle repetido pela fonte é ignorado: nenhuma linha nova e nenhum erro', async () => {
    const live = buildLive({ dataset: BTC_HOURLY, overrides: { hooks: { isStaleRead: true } } });
    const { evaluator, logger } = await createTestEvaluator(live, {
      maxStepsPerPass: TOTAL_CANDLES * 2,
    });
    await tickUntilIdle(evaluator);
    await evaluator.tick();
    await evaluator.tick();
    expect(live.state.commits).toBe(TOTAL_CANDLES);
    expect(live.state.status).toBe('running');
    expect(logger.entries.filter((entry) => entry.level === 'error')).toHaveLength(0);
    expectEqualToTheContinuousRun(live);
  });

  test('no máximo maxStepsPerPass passos por execução em cada ronda', async () => {
    const live = buildLive({ dataset: BTC_HOURLY });
    const { evaluator } = await createTestEvaluator(live, { maxStepsPerPass: 7 });
    expect((await evaluator.tick()).steps).toBe(7);
    expect((await evaluator.tick()).steps).toBe(7);
    expect(live.state.commits).toBe(14);
  });

  test('o motor é o de produção também no timeframe diário', async () => {
    const setup = classicSetup(ETH_DAILY);
    const live = buildLive({ dataset: ETH_DAILY });
    const { evaluator } = await createTestEvaluator(live);
    await tickUntilIdle(evaluator);
    expect(live.snapshot()).toStrictEqual(runReference({ setup, candles: ETH_DAILY.candles }).rows);
  });
});

describe('avaliador ao vivo: reinício no meio não duplica', () => {
  test.each(CRASH_POINTS)(
    'queda dentro do passo %i: nada dele fica e a retomada completa igual',
    async (point) => {
      const live = buildLive({
        dataset: BTC_HOURLY,
        overrides: {
          hooks: {
            afterAppend: (commit) => {
              if (commit === point && !crashed.isDone) {
                crashed.isDone = true;
                throw postgresCrash();
              }
            },
          },
        },
      });
      const crashed = { isDone: false };
      const first = await createTestEvaluator(live, { instanceId: 'worker-doomed' });
      await tickUntilIdle(first.evaluator);
      expect(crashed.isDone).toBe(true);
      expect(live.state.status).toBe('running');
      live.state.isHeartbeatExpired = true;
      const second = await createTestEvaluator(live, { instanceId: 'worker-rescuer' });
      await tickUntilIdle(second.evaluator);
      expect(live.state.commits).toBe(TOTAL_CANDLES);
      expectEqualToTheContinuousRun(live);
    },
  );

  test('instância nova assume a de batimento vencido e termina igual ao fluxo contínuo', async () => {
    const live = buildLive({ dataset: BTC_HOURLY });
    const first = await createTestEvaluator(live, { instanceId: 'worker-a', maxStepsPerPass: 200 });
    await first.evaluator.tick();
    expect(live.state.commits).toBe(200);
    live.state.isHeartbeatExpired = true;
    const second = await createTestEvaluator(live, { instanceId: 'worker-b' });
    const totals = await tickUntilIdle(second.evaluator);
    expect(totals.claimed).toBe(1);
    expect(second.logger.entries.map((entry) => entry.message)).toContain(
      'live run taken over from a stopped worker',
    );
    expect(live.state.claimedBy).toBe('worker-b');
    expectEqualToTheContinuousRun(live);
  });

  test('a instância que perdeu a posse descobre ao renovar o batimento e para de avaliar', async () => {
    const live = buildLive({ dataset: BTC_HOURLY });
    const loser = await createTestEvaluator(live, { instanceId: 'worker-a', maxStepsPerPass: 50 });
    await loser.evaluator.tick();
    live.state.claimedBy = 'worker-b';
    const summary = await loser.evaluator.tick();
    expect(summary.steps).toBe(0);
    expect(live.state.commits).toBe(50);
    expect(loser.logger.entries.map((entry) => entry.message)).toContain(
      'live run lost to another worker',
    );
  });

  test('encerramento gracioso devolve a simulação à fila e outra instância retoma', async () => {
    const live = buildLive({ dataset: BTC_HOURLY });
    const first = await createTestEvaluator(live, { instanceId: 'worker-a', maxStepsPerPass: 100 });
    await first.evaluator.tick();
    expect(await first.evaluator.release()).toBe(1);
    expect(live.state.status).toBe('queued');
    expect(live.state.claimedBy).toBeUndefined();
    const second = await createTestEvaluator(live, { instanceId: 'worker-b' });
    await tickUntilIdle(second.evaluator);
    expectEqualToTheContinuousRun(live);
  });
});
