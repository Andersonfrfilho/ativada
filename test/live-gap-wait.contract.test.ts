// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, test } from 'bun:test';

import type { GapPolicy } from '../apps/worker-ativada/src/live/gap-policy.js';
import {
  buildLive,
  classicSetup,
  createTestEvaluator,
  runReference,
  tickUntilIdle,
  withoutCandles,
} from './fixtures/live/live-scenarios.fixture.js';
import {
  REAL_DATASETS,
  type RealDataset,
} from './fixtures/strategy-engine/signal/classic-signals.fixture.js';

function requireDataset(): RealDataset {
  const dataset = REAL_DATASETS[0];
  if (dataset === undefined) throw new Error('conjunto real ausente');
  return dataset;
}

const DATASET = requireDataset();
const HOUR = 3_600_000;
const HOLE_AT = 300;
const HOLE_SIZE = 3;
const TOTAL_CANDLES = DATASET.candles.length;
const CONFIRM_AFTER = 3;
const MINIMUM_AGE = 10 * 60_000;
const LOOKBACK = 168 * HOUR;
const LAST_MISSING_CLOSE = (DATASET.candles[HOLE_AT + HOLE_SIZE - 1]?.openTime ?? 0) + HOUR;

type Clock = { age: number; recovery: number };

// Um relógio de teste: a idade do buraco e o instante da última recuperação limpa, controlados à mão.
function policyOf(clock: Clock): GapPolicy {
  return {
    now: () => LAST_MISSING_CLOSE + clock.age,
    lastCleanRecoveryAt: () => clock.recovery,
    confirmAfterFailedRecoveries: CONFIRM_AFTER,
    minimumGapAgeMilliseconds: MINIMUM_AGE,
    recoveryLookbackMilliseconds: LOOKBACK,
  };
}

function holeyLive(): ReturnType<typeof buildLive> {
  const holey = withoutCandles(DATASET.candles, { from: HOLE_AT, count: HOLE_SIZE });
  return buildLive({ dataset: DATASET, candles: holey });
}

// Cada rodada de recuperação limpa termina um pouco depois da anterior (e depois de a espera começar).
function finishRecoveryRound(clock: Clock): void {
  clock.recovery = LAST_MISSING_CLOSE + clock.age + 1;
  clock.age += 1;
}

describe('espera por buraco de candles: a decisão fica gravada na execução', () => {
  test('o buraco espera, grava desde quando e por qual candle, e avisa o dono UMA vez', async () => {
    const live = holeyLive();
    const clock: Clock = { age: HOUR, recovery: 0 };
    const { evaluator } = await createTestEvaluator(live, { gapPolicy: policyOf(clock) });
    await tickUntilIdle(evaluator);
    await tickUntilIdle(evaluator);
    await tickUntilIdle(evaluator);
    expect(live.state.commits).toBe(HOLE_AT);
    expect(live.state.wait).toMatchObject({
      since: LAST_MISSING_CLOSE + HOUR,
      openTime: DATASET.candles[HOLE_AT]?.openTime,
      failedRecoveries: 0,
    });
    expect(live.state.waitWarnings).toBe(1);
  });

  test('N recuperações limpas que não preenchem o buraco o confirmam: a simulação segue e a espera some', async () => {
    const live = holeyLive();
    const clock: Clock = { age: HOUR, recovery: 0 };
    const { evaluator } = await createTestEvaluator(live, { gapPolicy: policyOf(clock) });
    await tickUntilIdle(evaluator);
    for (let round = 1; round < CONFIRM_AFTER; round += 1) {
      finishRecoveryRound(clock);
      await tickUntilIdle(evaluator);
      expect(live.state.commits).toBe(HOLE_AT);
      expect(live.state.wait?.failedRecoveries).toBe(round);
    }
    finishRecoveryRound(clock);
    await tickUntilIdle(evaluator);
    expect(live.state.commits).toBe(TOTAL_CANDLES - HOLE_SIZE);
    expect(live.state.wait).toBeUndefined();
    expect(live.state.waitClears).toBe(1);
    const reference = runReference({
      setup: classicSetup(DATASET),
      candles: withoutCandles(DATASET.candles, { from: HOLE_AT, count: HOLE_SIZE }),
    });
    expect(live.snapshot()).toStrictEqual(reference.rows);
  });

  test('a mesma recuperação, vista por várias rondas, conta uma vez só', async () => {
    const live = holeyLive();
    const clock: Clock = { age: HOUR, recovery: 0 };
    const { evaluator } = await createTestEvaluator(live, { gapPolicy: policyOf(clock) });
    await tickUntilIdle(evaluator);
    finishRecoveryRound(clock);
    for (let tick = 0; tick < 5; tick += 1) await tickUntilIdle(evaluator);
    expect(live.state.wait?.failedRecoveries).toBe(1);
  });

  test('uma recuperação que terminou ANTES de a espera começar não conta', async () => {
    const live = holeyLive();
    const clock: Clock = { age: HOUR, recovery: LAST_MISSING_CLOSE + HOUR - 1 };
    const { evaluator } = await createTestEvaluator(live, { gapPolicy: policyOf(clock) });
    await tickUntilIdle(evaluator);
    await tickUntilIdle(evaluator);
    expect(live.state.wait?.failedRecoveries).toBe(0);
  });

  test('reiniciar o worker não perde a espera nem a contagem: a decisão não depende da memória', async () => {
    const live = holeyLive();
    const clock: Clock = { age: HOUR, recovery: 0 };
    const first = await createTestEvaluator(live, { gapPolicy: policyOf(clock) });
    await tickUntilIdle(first.evaluator);
    finishRecoveryRound(clock);
    await tickUntilIdle(first.evaluator);
    finishRecoveryRound(clock);
    await tickUntilIdle(first.evaluator);
    expect(live.state.wait?.failedRecoveries).toBe(2);
    live.state.isHeartbeatExpired = true;
    const restartedClock: Clock = { age: clock.age, recovery: 0 };
    const second = await createTestEvaluator(live, {
      instanceId: 'worker-reiniciado',
      gapPolicy: policyOf(restartedClock),
    });
    await tickUntilIdle(second.evaluator);
    expect(live.state.commits).toBe(HOLE_AT);
    expect(live.state.wait?.failedRecoveries).toBe(2);
    finishRecoveryRound(restartedClock);
    await tickUntilIdle(second.evaluator);
    expect(live.state.commits).toBe(TOTAL_CANDLES - HOLE_SIZE);
    expect(live.state.wait).toBeUndefined();
  });

  test('buraco além do alcance da recuperação (mais velho que o lookback) é confirmado sem esperar', async () => {
    const live = holeyLive();
    const clock: Clock = { age: LOOKBACK + HOUR, recovery: 0 };
    const { evaluator } = await createTestEvaluator(live, { gapPolicy: policyOf(clock) });
    await tickUntilIdle(evaluator);
    expect(live.state.commits).toBe(TOTAL_CANDLES - HOLE_SIZE);
    expect(live.state.wait).toBeUndefined();
  });

  test('buraco recém-aberto não é confirmado por contagem alguma: o candle pode só estar atrasado no REST', async () => {
    const live = holeyLive();
    const clock: Clock = { age: MINIMUM_AGE - 1, recovery: 0 };
    const { evaluator } = await createTestEvaluator(live, { gapPolicy: policyOf(clock) });
    await tickUntilIdle(evaluator);
    for (let round = 0; round < CONFIRM_AFTER + 2; round += 1) {
      clock.recovery = LAST_MISSING_CLOSE + clock.age + round + 1;
      await tickUntilIdle(evaluator);
    }
    expect(live.state.commits).toBe(HOLE_AT);
    expect(live.state.wait).toBeDefined();
  });

  test('buraco preenchido enquanto espera: a simulação segue idêntica à contínua e a espera some', async () => {
    const live = holeyLive();
    const clock: Clock = { age: HOUR, recovery: 0 };
    const { evaluator } = await createTestEvaluator(live, { gapPolicy: policyOf(clock) });
    await tickUntilIdle(evaluator);
    expect(live.state.wait).toBeDefined();
    live.addCandles(DATASET.candles.slice(HOLE_AT, HOLE_AT + HOLE_SIZE));
    await tickUntilIdle(evaluator);
    expect(live.state.commits).toBe(TOTAL_CANDLES);
    expect(live.state.wait).toBeUndefined();
    expect(live.snapshot()).toStrictEqual(
      runReference({ setup: classicSetup(DATASET), candles: DATASET.candles }).rows,
    );
  });

  test('a confirmação em memória da recuperação do stream segue valendo e não grava espera', async () => {
    const live = holeyLive();
    const clock: Clock = { age: HOUR, recovery: 0 };
    const { evaluator } = await createTestEvaluator(live, {
      gapPolicy: policyOf(clock),
      isGapConfirmed: () => true,
    });
    await tickUntilIdle(evaluator);
    expect(live.state.commits).toBe(TOTAL_CANDLES - HOLE_SIZE);
    expect(live.state.waitWarnings).toBe(0);
  });
});
