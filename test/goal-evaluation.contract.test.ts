// Copyright (c) 2026 Ada Technology. All rights reserved.
import { createHash } from 'node:crypto';

import { describe, expect, test } from 'bun:test';

import {
  canonicalJson,
  computeStrategyLeadInCandles,
  ENGINE_TIMEFRAME_DURATION_MILLISECONDS,
} from '../packages/strategy-engine/src/index.js';
import type { GoalEvaluation } from '../packages/strategy-engine/src/index.js';
import { loadGoalApi } from './fixtures/strategy-engine/goal/goal-api.fixture.js';
import {
  FAST_STRATEGY,
  NEVER_BUYS_STRATEGY,
  REAL_SCENARIOS,
  sentimentScenario,
  syntheticScenario,
  type GoalScenario,
} from './fixtures/strategy-engine/goal/goal-scenarios.fixture.js';

const api = await loadGoalApi();
const GOAL = { targetRate: '0.03', maxLossRate: '0.05', horizonDays: 30 };
const DAY = 86_400_000;
// O prazo cabe na série curta de cada conjunto real: 30 dias nos 400 candles diários, 3 dias nos 500 de 1 hora.
const REAL_GOALS: Readonly<Record<string, typeof GOAL>> = {
  '1d': { targetRate: '0.02', maxLossRate: '0.05', horizonDays: 30 },
  '1h': { targetRate: '0.01', maxLossRate: '0.02', horizonDays: 3 },
};

function hashOf(value: unknown): string {
  return createHash('sha256').update(canonicalJson(value)).digest('hex');
}

function evaluate(scenario: GoalScenario, goal = GOAL): GoalEvaluation {
  return api.evaluateGoal({
    strategy: scenario.strategy,
    run: scenario.run,
    candles: scenario.candles,
    goal,
  });
}

function codeOf(action: () => unknown): string | undefined {
  try {
    action();
  } catch (error: unknown) {
    return (error as { code?: string }).code;
  }
  return undefined;
}

describe.each(REAL_SCENARIOS.map((scenario) => [scenario.name, scenario] as const))(
  'a meta sobre candles reais: %s',
  (_name, scenario) => {
    const { timeframe } = scenario.run.parameters;
    const goal = REAL_GOALS[timeframe] ?? GOAL;
    const horizonCandles =
      (goal.horizonDays * DAY) / ENGINE_TIMEFRAME_DURATION_MILLISECONDS[timeframe];
    const leadIn = computeStrategyLeadInCandles(scenario.strategy.config);
    const result = evaluate(scenario, goal);

    test('conta uma janela por candle decidido cujo prazo cabe na série (passo de 1 candle)', () => {
      const expected = scenario.candles.length - (leadIn - 1) - horizonCandles + 1;
      expect(result.windowCount).toBe(expected);
      expect(result.horizonCandles).toBe(horizonCandles);
      expect(result.firstWindowOpenTime).toBe(scenario.candles[leadIn - 1]?.openTime ?? -1);
      expect(result.lastWindowOpenTime).toBe(
        scenario.candles[scenario.candles.length - horizonCandles]?.openTime ?? -1,
      );
    });

    test('todo desfecho é contado uma vez e as taxas respeitam as contagens', () => {
      expect(result.reachedCount + result.stoppedCount + result.expiredCount).toBe(
        result.windowCount,
      );
      expect(result.reachedCount).toBeGreaterThan(0);
      expect(result.expiredCount).toBeGreaterThan(0);
      expect(result.benchmark.reachedCount + result.benchmark.stoppedCount).toBeGreaterThan(0);
      expect(Number(result.reachRate)).toBeLessThanOrEqual(
        result.reachedCount / result.windowCount,
      );
      expect(Number(result.stopRate)).toBeGreaterThanOrEqual(
        result.stoppedCount / result.windowCount,
      );
      expect(result.verdict).toMatch(/^(COMPRAR|SEGURAR|EVITAR)$/);
      expect(result.version).toBe('goal-1');
    });

    test('é determinística: o mesmo pedido dá o mesmo resultado, byte a byte', () => {
      expect(hashOf(evaluate(scenario, goal))).toBe(hashOf(result));
      expect(evaluate(scenario, goal)).toStrictEqual(result);
    });
  },
);

describe('casos de resultado conhecido', () => {
  const series = syntheticScenario({ seed: 11, count: 700, strategy: NEVER_BUYS_STRATEGY });

  test('estratégia que nunca compra: todas as janelas vencem o prazo, sem ganho nem perda', () => {
    const result = evaluate(series, { targetRate: '0.03', maxLossRate: '0.05', horizonDays: 5 });
    expect(result.windowCount).toBeGreaterThan(20);
    expect(result).toMatchObject({
      reachedCount: 0,
      stoppedCount: 0,
      expiredCount: result.windowCount,
      reachRate: '0',
      stopRate: '0',
      expiredRate: '1',
      medianCandlesToTarget: null,
      medianDaysToTarget: null,
      netReturn: { mean: '0', median: '0' },
      verdict: 'EVITAR',
    });
  });

  test('o comprar e segurar é medido na mesma janela e com os mesmos custos', () => {
    const result = evaluate(series, { targetRate: '0.001', maxLossRate: '0.5', horizonDays: 5 });
    expect(result.benchmark.reachedCount).toBeGreaterThan(0);
    expect(result.benchmark.reachedCount + result.benchmark.stoppedCount).toBeLessThanOrEqual(
      result.windowCount,
    );
    expect(result.reachedCount).toBe(0);
  });

  test('meta irreal não é bloqueada: nenhuma janela chega e o resultado diz isso', () => {
    const result = evaluate(series, { targetRate: '5', maxLossRate: '0.05', horizonDays: 5 });
    expect(result.reachedCount).toBe(0);
    expect(result.reachRate).toBe('0');
  });

  test('série curta demais para uma janela: zero janelas, nada inventado, régua SEGURAR', () => {
    const short = syntheticScenario({ seed: 11, count: 100, strategy: FAST_STRATEGY });
    const result = evaluate(short, { targetRate: '0.03', maxLossRate: '0.05', horizonDays: 30 });
    expect(result).toMatchObject({
      windowCount: 0,
      reachRate: null,
      stopRate: null,
      firstWindowOpenTime: null,
      lastWindowOpenTime: null,
      verdict: 'SEGURAR',
    });
  });

  test('a estratégia que opera muito fecha janelas pelo alvo e pelo stop', () => {
    const busy = syntheticScenario({ seed: 5, count: 900, strategy: FAST_STRATEGY });
    const result = evaluate(busy, { targetRate: '0.02', maxLossRate: '0.03', horizonDays: 3 });
    expect(result.reachedCount).toBeGreaterThan(0);
    expect(result.stoppedCount).toBeGreaterThan(0);
    expect(result.medianCandlesToTarget).not.toBeNull();
    expect(Number(result.medianDaysToTarget)).toBeLessThanOrEqual(3);
  });
});

describe('a meta devolvida é a normalizada', () => {
  test('grafia equivalente sai canônica', () => {
    const scenario = syntheticScenario({ seed: 3, count: 400, strategy: FAST_STRATEGY });
    const result = evaluate(scenario, {
      targetRate: '0.0300',
      maxLossRate: '0.050',
      horizonDays: 2,
    });
    expect(result.goal).toStrictEqual({ targetRate: '0.03', maxLossRate: '0.05', horizonDays: 2 });
  });
});

describe('o sentimento entra no sinal da meta', () => {
  test('a mesma série com e sem as observações dá resultados diferentes', () => {
    const scenario = sentimentScenario({ seed: 8, count: 700 });
    const goal = { targetRate: '0.02', maxLossRate: '0.03', horizonDays: 3 };
    const request = {
      strategy: scenario.strategy,
      run: scenario.run,
      candles: scenario.candles,
      goal,
    };
    const without = api.evaluateGoal(request);
    const withSentiment = api.evaluateGoal({ ...request, sentiments: scenario.sentiments });
    expect(withSentiment).not.toStrictEqual(without);
    expect(withSentiment.windowCount).toBe(without.windowCount);
  });
});

describe('a entrada é recusada em voz alta, com código estável', () => {
  const scenario = syntheticScenario({ seed: 3, count: 400, strategy: FAST_STRATEGY });

  test('meta inválida', () => {
    expect(codeOf(() => evaluate(scenario, { ...GOAL, horizonDays: 0 }))).toBe('INVALID_GOAL');
  });

  test('lacuna na série: a série precisa ser contígua', () => {
    const withGap = [...scenario.candles.slice(0, 200), ...scenario.candles.slice(201)];
    expect(codeOf(() => evaluate({ ...scenario, candles: withGap }))).toBe(
      'CANDLES_NOT_CONTIGUOUS',
    );
  });

  test('candle de outro par', () => {
    const foreign = scenario.candles.map((candle, index) =>
      index === 5 ? { ...candle, symbol: 'ETHUSDT' } : candle,
    );
    expect(codeOf(() => evaluate({ ...scenario, candles: foreign }))).toBe('INVALID_CANDLES');
  });

  test('candle com preço impossível (a mínima acima da máxima)', () => {
    const broken = scenario.candles.map((candle, index) =>
      index === 7 ? { ...candle, low: '999999999', high: '1' } : candle,
    );
    expect(codeOf(() => evaluate({ ...scenario, candles: broken }))).toBe('INVALID_CANDLES');
  });

  test('sentimento com tamanho diferente do dos candles', () => {
    const run = (): GoalEvaluation =>
      api.evaluateGoal({
        strategy: scenario.strategy,
        run: scenario.run,
        candles: scenario.candles,
        goal: GOAL,
        sentiments: [undefined],
      });
    expect(codeOf(run)).toBe('INVALID_SENTIMENTS');
  });

  test('a recusa não repete o valor recebido', () => {
    const marked = scenario.candles.map((candle, index) =>
      index === 3 ? { ...candle, open: 'SEGREDO-987' } : candle,
    );
    try {
      evaluate({ ...scenario, candles: marked });
      throw new Error('deveria recusar');
    } catch (error: unknown) {
      expect((error as Error).message).not.toContain('SEGREDO');
    }
  });
});
