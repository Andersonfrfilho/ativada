// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, test } from 'bun:test';

import { EngineDecimal, type EngineDecimalValue } from '../packages/strategy-engine/src/index.js';
import type {
  GoalSummary,
  GoalPoint,
  GoalWindowResult,
} from '../packages/strategy-engine/src/goal/goal.types.js';
import { loadGoalApi } from './fixtures/strategy-engine/goal/goal-api.fixture.js';

const api = await loadGoalApi();

function decimal(text: string): EngineDecimalValue {
  return new EngineDecimal(text);
}

function point(equity: string, equityAtLow = equity): GoalPoint {
  return { equity: decimal(equity), equityAtLow: decimal(equityAtLow) };
}

function codeOf(action: () => unknown): string | undefined {
  try {
    action();
  } catch (error: unknown) {
    return (error as { code?: string }).code;
  }
  return undefined;
}

describe('os níveis da meta: contas à mão, sempre arredondados para CIMA a 8 casas', () => {
  test.each([
    ['10000', '0.03', '0.05', '10300', '9500'],
    ['10000', '0.5', '0.99', '15000', '100'],
    ['100.00000001', '0.03', '0.05', '103.00000002', '95.00000001'],
    ['0.00000003', '0.5', '0.5', '0.00000005', '0.00000002'],
    ['250.5', '0.1', '0.08', '275.55', '230.46'],
  ])(
    'saldo %s, alvo %s, perda %s -> alvo %s e stop %s',
    (initial, targetRate, maxLossRate, target, stop) => {
      const levels = api.computeGoalLevels({
        initial: decimal(initial),
        goal: { targetRate, maxLossRate, horizonDays: 30 },
      });
      expect(levels.target.toFixed()).toBe(target);
      expect(levels.stop.toFixed()).toBe(stop);
    },
  );
});

describe('o desfecho de uma janela, candle a candle', () => {
  const levels = { target: decimal('10300'), stop: decimal('9500') };

  function classify(points: readonly GoalPoint[]): GoalWindowResult {
    return api.classifyGoalWindow({
      levels,
      horizonCandles: points.length,
      pointAt: (offset) => points[offset] ?? point('0'),
    });
  }

  test('chega ao alvo no 3º candle: tempo 3 e valor final = o fechamento', () => {
    const result = classify([point('10000'), point('10100'), point('10350'), point('9000')]);
    expect(result).toMatchObject({ outcome: 'reached', candlesElapsed: 3 });
    expect(result.finalValue.toFixed()).toBe('10350');
  });

  test('o alvo é por fechamento: a máxima não conta (a mínima do candle, sim, para a perda)', () => {
    const result = classify([point('10200'), point('10299.99999999'), point('10299')]);
    expect(result.outcome).toBe('expired');
  });

  test('bate a perda máxima pela MÍNIMA do candle, mesmo com o fechamento acima: valor final = a mínima', () => {
    const result = classify([point('10000'), point('9900', '9400'), point('10400')]);
    expect(result).toMatchObject({ outcome: 'stopped', candlesElapsed: 2 });
    expect(result.finalValue.toFixed()).toBe('9400');
  });

  test('alvo e perda máxima no MESMO candle: vale o lado pior (a perda)', () => {
    const result = classify([point('10400', '9400')]);
    expect(result).toMatchObject({ outcome: 'stopped', candlesElapsed: 1 });
  });

  test('exatamente no nível conta: patrimônio = alvo chega; mínima = stop bate', () => {
    expect(classify([point('10300')]).outcome).toBe('reached');
    expect(classify([point('10000', '9500')]).outcome).toBe('stopped');
    expect(classify([point('10299.99999999', '9500.00000001')]).outcome).toBe('expired');
  });

  test('o primeiro desfecho encerra a janela: o que vem depois não muda nada', () => {
    const result = classify([point('10000'), point('10300'), point('9000', '8000')]);
    expect(result).toMatchObject({ outcome: 'reached', candlesElapsed: 2 });
  });

  test('vence o prazo: tempo = o prazo inteiro e valor final = o último fechamento', () => {
    const result = classify([point('10000'), point('10100'), point('9800', '9600')]);
    expect(result).toMatchObject({ outcome: 'expired', candlesElapsed: 3 });
    expect(result.finalValue.toFixed()).toBe('9800');
  });
});

describe('o resumo das janelas: taxas contra o usuário, mediana arredondada para cima', () => {
  const INITIAL = decimal('10000');
  const DAY_MILLISECONDS = 86_400_000;

  function window(
    outcome: GoalWindowResult['outcome'],
    elapsed: number,
    value: string,
  ): GoalWindowResult {
    return { outcome, candlesElapsed: elapsed, finalValue: decimal(value) };
  }

  function summarize(
    results: readonly GoalWindowResult[],
    candleDurationMilliseconds = DAY_MILLISECONDS,
    benchmarkOutcomes: readonly GoalWindowResult['outcome'][] = [],
  ): GoalSummary {
    return api.summarizeGoalWindows({
      results,
      benchmarkResults: benchmarkOutcomes.map((outcome) => ({ outcome })),
      initial: INITIAL,
      candleDurationMilliseconds,
    });
  }

  test('8 janelas: 3 chegaram (2, 5 e 6 candles), 2 bateram o stop, 3 venceram o prazo', () => {
    const summary = summarize([
      window('reached', 5, '10300'),
      window('stopped', 2, '9400'),
      window('expired', 30, '10100'),
      window('reached', 2, '10400'),
      window('expired', 30, '9900'),
      window('reached', 6, '10300'),
      window('stopped', 9, '9300'),
      window('expired', 30, '10000'),
    ]);
    expect(summary).toMatchObject({
      windowCount: 8,
      reachedCount: 3,
      stoppedCount: 2,
      expiredCount: 3,
      reachRate: '0.375',
      stopRate: '0.25',
      expiredRate: '0.375',
      medianCandlesToTarget: '5',
      medianDaysToTarget: '5',
    });
  });

  test('1 de 3: a taxa de chegada vai para BAIXO e a de stop para CIMA', () => {
    const summary = summarize([
      window('reached', 4, '10300'),
      window('stopped', 1, '9500'),
      window('expired', 30, '10000'),
    ]);
    expect(summary.reachRate).toBe('0.33333333');
    expect(summary.stopRate).toBe('0.33333334');
    expect(summary.expiredRate).toBe('0.33333333');
  });

  test('mediana com número par de janelas que chegaram é a média dos dois do meio', () => {
    const summary = summarize([window('reached', 2, '10300'), window('reached', 5, '10300')]);
    expect(summary.medianCandlesToTarget).toBe('3.5');
    expect(summary.medianDaysToTarget).toBe('3.5');
  });

  test('em candles de 1 hora o tempo em dias é a mediana ÷ 24, arredondada para CIMA a 2 casas', () => {
    const HOUR = 3_600_000;
    const summary = summarize([window('reached', 5, '10300'), window('reached', 2, '10300')], HOUR);
    expect(summary.medianCandlesToTarget).toBe('3.5');
    expect(summary.medianDaysToTarget).toBe('0.15');
    const exact = summarize([window('reached', 12, '10300')], HOUR);
    expect(exact.medianDaysToTarget).toBe('0.5');
  });

  test('o retorno líquido é o valor final sobre o saldo, de TODAS as janelas, para BAIXO a 8 casas', () => {
    const summary = summarize([
      window('reached', 3, '10300'),
      window('stopped', 1, '9500'),
      window('expired', 30, '10000'),
    ]);
    expect(summary.netReturn).toStrictEqual({ mean: '-0.00666667', median: '0' });
    const evenCount = summarize([window('reached', 3, '10300'), window('expired', 30, '10001')]);
    expect(evenCount.netReturn).toStrictEqual({ mean: '0.01505', median: '0.01505' });
  });

  test('sem janelas nada é inventado: contagens zero e tudo o mais nulo', () => {
    expect(summarize([])).toStrictEqual({
      windowCount: 0,
      reachedCount: 0,
      stoppedCount: 0,
      expiredCount: 0,
      reachRate: null,
      stopRate: null,
      expiredRate: null,
      medianCandlesToTarget: null,
      medianDaysToTarget: null,
      netReturn: { mean: null, median: null },
      benchmark: { reachedCount: 0, stoppedCount: 0, reachRate: null, stopRate: null },
    });
  });

  test('sem nenhuma janela que chegou ao alvo não há tempo típico', () => {
    const summary = summarize([window('stopped', 3, '9500'), window('expired', 30, '10000')]);
    expect(summary.medianCandlesToTarget).toBeNull();
    expect(summary.medianDaysToTarget).toBeNull();
  });

  test('comprar e segurar tem as próprias taxas (chegada para baixo, stop para cima)', () => {
    const summary = summarize(
      [
        window('expired', 30, '10000'),
        window('expired', 30, '10000'),
        window('expired', 30, '10000'),
      ],
      DAY_MILLISECONDS,
      ['reached', 'stopped', 'expired'],
    );
    expect(summary.benchmark).toStrictEqual({
      reachedCount: 1,
      stoppedCount: 1,
      reachRate: '0.33333333',
      stopRate: '0.33333334',
    });
  });
});

describe('a régua COMPRAR / SEGURAR / EVITAR: limiares fixos sobre as contagens exatas', () => {
  test.each([
    // [janelas, chegaram, stop, régua, porquê]
    [100, 50, 25, 'COMPRAR', 'exatamente 50% de chegada e 25% de stop: limiares inclusivos'],
    [100, 49, 25, 'SEGURAR', 'um a menos na chegada'],
    [100, 50, 26, 'SEGURAR', 'um a mais no stop'],
    [100, 80, 5, 'COMPRAR', 'folga nos dois'],
    [100, 20, 40, 'EVITAR', '40% de stop é o limite inclusivo'],
    [100, 60, 39, 'SEGURAR', 'stop logo abaixo do limite de evitar mas acima do de comprar'],
    [100, 15, 10, 'EVITAR', '15% de chegada é o limite inclusivo'],
    [100, 16, 10, 'SEGURAR', 'um acima do limite de evitar'],
    [100, 0, 0, 'EVITAR', 'nunca chegou'],
    [19, 19, 0, 'SEGURAR', 'menos de 20 janelas: sem base'],
    [20, 20, 0, 'COMPRAR', 'exatamente 20 janelas já decide'],
    [20, 3, 0, 'EVITAR', '3/20 = 15%'],
    [0, 0, 0, 'SEGURAR', 'sem janela alguma'],
    [7, 1, 1, 'SEGURAR', 'poucas janelas nunca recomendam, nem para evitar'],
  ])('%i janelas, %i chegaram, %i no stop -> %s (%s)', (windowCount, reached, stopped, verdict) => {
    const resolved: string = api.resolveGoalVerdict({
      windowCount,
      reachedCount: reached,
      stoppedCount: stopped,
    });
    expect(resolved).toBe(verdict);
  });

  test('os limiares documentados no ADR são os da constante', async () => {
    const { GOAL_VERDICT_RULES } =
      await import('../packages/strategy-engine/src/goal/goal.constant.js');
    expect(GOAL_VERDICT_RULES).toStrictEqual({
      minimumWindows: 20,
      buyMinimumReachRate: '0.5',
      buyMaximumStopRate: '0.25',
      avoidMinimumStopRate: '0.4',
      avoidMaximumReachRate: '0.15',
    });
  });
});

describe('a meta declarada: bordas e recusa sem eco do valor', () => {
  test('aceita e normaliza a grafia', () => {
    expect(
      api.parseGoalSpec({ targetRate: '0.030', maxLossRate: '0.05', horizonDays: 30 }),
    ).toStrictEqual({
      targetRate: '0.03',
      maxLossRate: '0.05',
      horizonDays: 30,
    });
  });

  test.each([
    ['ganho zero', { targetRate: '0', maxLossRate: '0.05', horizonDays: 30 }],
    ['ganho negativo', { targetRate: '-0.03', maxLossRate: '0.05', horizonDays: 30 }],
    ['ganho acima de 1000%', { targetRate: '10.1', maxLossRate: '0.05', horizonDays: 30 }],
    ['perda zero', { targetRate: '0.03', maxLossRate: '0', horizonDays: 30 }],
    ['perda de 100%', { targetRate: '0.03', maxLossRate: '1', horizonDays: 30 }],
    ['9 casas', { targetRate: '0.123456789', maxLossRate: '0.05', horizonDays: 30 }],
    ['prazo zero', { targetRate: '0.03', maxLossRate: '0.05', horizonDays: 0 }],
    ['prazo de 366 dias', { targetRate: '0.03', maxLossRate: '0.05', horizonDays: 366 }],
    ['prazo fracionário', { targetRate: '0.03', maxLossRate: '0.05', horizonDays: 1.5 }],
    ['campo desconhecido', { targetRate: '0.03', maxLossRate: '0.05', horizonDays: 30, extra: 1 }],
    ['número no lugar do texto', { targetRate: 0.03, maxLossRate: '0.05', horizonDays: 30 }],
  ])('recusa: %s', (_name, input) => {
    expect(codeOf(() => api.parseGoalSpec(input))).toBe('INVALID_GOAL');
  });

  test('a recusa lista os campos e nunca repete o valor recebido', () => {
    try {
      api.parseGoalSpec({ targetRate: 'SEGREDO-123', maxLossRate: '0.05', horizonDays: 30 });
      throw new Error('deveria recusar');
    } catch (error: unknown) {
      const refused = error as { message: string; issues: string[] };
      expect(refused.issues).toStrictEqual(['targetRate']);
      expect(refused.message).not.toContain('SEGREDO');
    }
  });
});
