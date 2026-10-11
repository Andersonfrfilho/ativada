// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, test } from 'bun:test';

import {
  createRunSetup,
  EngineDecimal,
  type RunParameters,
} from '../packages/strategy-engine/src/index.js';
import { loadPlanApi } from './fixtures/strategy-engine/plan/plan-api.fixture.js';

const api = await loadPlanApi();

type Costs = {
  readonly feeRate: string;
  readonly slippageRate: string;
  readonly tickSize: string;
};

function parametersWith(costs: Costs): RunParameters {
  return createRunSetup({
    schemaVersion: 1,
    symbol: 'BTCUSDT',
    timeframe: '1h',
    sentimentSource: 'alternative.me',
    ...costs,
  }).parameters;
}

describe('alvo e stop de venda: contas à mão (oráculo Decimal do Python), sempre arredondados para CIMA no tick', () => {
  // entrada, taxa, slippage, tick, ganho, perda -> alvo e stop
  test.each([
    ['100', '0.001', '0.0005', '0.01', '0.03', '0.05', '103.31', '95.29'],
    ['60000', '0.001', '0.0005', '0.01', '0.1', '0.08', '66198.3', '55365.85'],
    ['0.5', '0', '0', '0.0001', '0.5', '0.5', '0.75', '0.25'],
    ['2.5', '0.002', '0.001', '0.001', '0.02', '0.01', '2.566', '2.491'],
    ['100', '0.001', '0.0005', '0.01', '0.001', '0.001', '100.41', '100.21'],
  ])(
    'entrada %s, taxa %s, slippage %s, tick %s, ganho %s, perda %s -> alvo %s e stop %s',
    (entry, feeRate, slippageRate, tickSize, targetRate, maxLossRate, target, stop) => {
      const levels = api.computePlanLevels({
        entry: new EngineDecimal(entry),
        parameters: parametersWith({
          feeRate: feeRate,
          slippageRate: slippageRate,
          tickSize: tickSize,
        }),
        goal: {
          targetRate: targetRate,
          maxLossRate: maxLossRate,
          horizonDays: 30,
        },
      });
      expect(levels.target).toStrictEqual({ rate: targetRate, price: target });
      expect(levels.stop).toStrictEqual({ rate: maxLossRate, price: stop });
    },
  );

  test('perda máxima menor que o custo de entrar: o stop fica ACIMA da entrada, sem esconder o fato', () => {
    const levels = api.computePlanLevels({
      entry: new EngineDecimal('100'),
      parameters: parametersWith({ feeRate: '0.001', slippageRate: '0.0005', tickSize: '0.01' }),
      goal: { targetRate: '0.001', maxLossRate: '0.001', horizonDays: 7 },
    });
    expect(new EngineDecimal(levels.stop.price).greaterThan('100')).toBe(true);
  });

  test('alvo e stop recusam meta inválida em vez de calcular com ela', () => {
    const attempt = (): unknown =>
      api.computePlanLevels({
        entry: new EngineDecimal('100'),
        parameters: parametersWith({ feeRate: '0.001', slippageRate: '0.0005', tickSize: '0.01' }),
        goal: { targetRate: '0', maxLossRate: '0.05', horizonDays: 30 },
      });
    expect(attempt).toThrow();
  });
});
