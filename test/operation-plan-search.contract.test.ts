// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, test } from 'bun:test';

import {
  EngineDecimal,
  type EngineDecimalValue,
  type SignalDecision,
} from '../packages/strategy-engine/src/index.js';
import { createSeededRandom } from './fixtures/backtest/synthetic-candles.fixture.js';
import { loadPlanInternals } from './fixtures/strategy-engine/plan/plan-api.fixture.js';

const { boundary, level } = await loadPlanInternals();
const ORIGIN = 1_000;
const MAXIMUM = 4_000;

type Probe = { readonly calls: number[]; readonly valueAt: (index: number) => boolean };

function spy(predicate: (index: number) => boolean): Probe {
  const calls: number[] = [];
  return {
    calls,
    valueAt: (index: number): boolean => {
      calls.push(index);
      return predicate(index);
    },
  };
}

function search(
  predicate: (index: number) => boolean,
  origin = ORIGIN,
): ReturnType<typeof boundary.findTransition> {
  return boundary.findTransition({ valueAt: predicate, origin, maximumIndex: MAXIMUM });
}

describe('a transição mais próxima do fechamento atual, no tick exato', () => {
  test.each([1, 2, 3, 4, 5, 7, 8, 9, 100, 777, 2_999])(
    'degrau para cima a %i ticks: o par adjacente é (degrau − 1, degrau)',
    (distance) => {
      const step = ORIGIN + distance;
      expect(search((index) => index >= step)).toStrictEqual({ same: step - 1, different: step });
    },
  );

  test.each([1, 2, 3, 4, 5, 7, 8, 9, 100, 777, 999])(
    'degrau para baixo a %i ticks: o par adjacente é (degrau + 1, degrau)',
    (distance) => {
      const step = ORIGIN - distance;
      expect(search((index) => index <= step)).toStrictEqual({ same: step + 1, different: step });
    },
  );

  test('o valor de origem verdadeiro vale igual: `same` é sempre o lado da origem', () => {
    const step = ORIGIN + 13;
    expect(search((index) => index < step)).toStrictEqual({ same: step - 1, different: step });
  });

  test('a mais próxima vence; a distâncias iguais, a de cima', () => {
    expect(search((index) => index < ORIGIN - 5 || index >= ORIGIN + 9)).toStrictEqual({
      same: ORIGIN - 5,
      different: ORIGIN - 6,
    });
    expect(search((index) => index < ORIGIN - 9 || index >= ORIGIN + 5)).toStrictEqual({
      same: ORIGIN + 4,
      different: ORIGIN + 5,
    });
    expect(search((index) => index <= ORIGIN - 6 || index >= ORIGIN + 6)).toStrictEqual({
      same: ORIGIN + 5,
      different: ORIGIN + 6,
    });
  });

  test('um tick de distância vence um tick mais longe do outro lado', () => {
    expect(search((index) => index >= ORIGIN && index <= ORIGIN + 1)).toStrictEqual({
      same: ORIGIN,
      different: ORIGIN - 1,
    });
  });

  test('a faixa vai de 1 a `maximumIndex`: o que está fora dela não existe', () => {
    expect(search((index) => index >= MAXIMUM)).toStrictEqual({
      same: MAXIMUM - 1,
      different: MAXIMUM,
    });
    expect(search((index) => index > MAXIMUM)).toBeUndefined();
    expect(search((index) => index <= 1)).toStrictEqual({ same: 2, different: 1 });
    expect(search((index) => index <= 0)).toBeUndefined();
    expect(search(() => false)).toBeUndefined();
  });

  test('nunca consulta um índice fora da faixa', () => {
    const probe = spy((index) => index >= MAXIMUM + 500 || index <= 0);
    expect(search(probe.valueAt, 40)).toBeUndefined();
    expect(Math.min(...probe.calls)).toBeGreaterThanOrEqual(1);
    expect(Math.max(...probe.calls)).toBeLessThanOrEqual(MAXIMUM);
  });

  test('a busca é logarítmica: 4.000 ticks de alcance custam poucas dezenas de consultas', () => {
    const probe = spy((index) => index >= ORIGIN + 2_345);
    expect(search(probe.valueAt)).toStrictEqual({
      same: ORIGIN + 2_344,
      different: ORIGIN + 2_345,
    });
    expect(probe.calls.length).toBeLessThan(40);
  });

  test('sem monotonia, o par achado é sempre válido (propriedade, 500 predicados aleatórios)', () => {
    const random = createSeededRandom(2026);
    for (let round = 0; round < 500; round += 1) {
      const intervals = Array.from({ length: 1 + Math.floor(random() * 4) }, () => {
        const start = 1 + Math.floor(random() * MAXIMUM);
        return [start, start + Math.floor(random() * 300)] as const;
      });
      const predicate = (index: number): boolean =>
        intervals.some(([start, end]) => index >= start && index <= end);
      const found = search(predicate);
      if (found === undefined) continue;
      expect(Math.abs(found.same - found.different)).toBe(1);
      expect(predicate(found.same)).toBe(predicate(ORIGIN));
      expect(predicate(found.different)).toBe(!predicate(ORIGIN));
    }
  });
});

const LAST_CLOSE = new EngineDecimal('100');
const PRICE_ORIGIN = 10_000;
const PRICE_MAXIMUM = 40_000;

function levelFor(params: {
  readonly fires: (index: number) => boolean;
  readonly wasActive?: boolean;
  readonly lastClose?: EngineDecimalValue;
  readonly origin?: number;
}): ReturnType<typeof level.resolveLevel> {
  const tick = new EngineDecimal('0.01');
  return level.resolveLevel({
    search: {
      probe: {
        priceOf: (index) => tick.times(index),
        decide: (index) =>
          ({
            action: params.fires(index) ? 'BUY' : 'HOLD',
            votes: [],
          }) as unknown as SignalDecision,
      },
      lastClose: params.lastClose ?? LAST_CLOSE,
      origin: params.origin ?? PRICE_ORIGIN,
      maximumIndex: PRICE_MAXIMUM,
    },
    isFiring: (decision) => decision.action === 'BUY',
    wasActive: params.wasActive ?? false,
  });
}

describe('o nível: já ativo, preço ou inalcançável', () => {
  test('sinal já ativo no último candle: sem busca, no último fechamento', () => {
    expect(levelFor({ fires: () => false, wasActive: true })).toStrictEqual({
      status: 'already_active',
      price: '100',
      trigger: null,
      direction: null,
      distance: '0',
      distanceRate: '0',
    });
  });

  test('dispara de um certo preço para cima: preço, lado e distância', () => {
    expect(levelFor({ fires: (index) => index >= 10_050 })).toStrictEqual({
      status: 'price',
      price: '100.5',
      trigger: 'at_or_above',
      direction: 'above',
      distance: '0.5',
      distanceRate: '0.005',
    });
  });

  test('dispara de um certo preço para baixo', () => {
    expect(levelFor({ fires: (index) => index <= 9_900 })).toStrictEqual({
      status: 'price',
      price: '99',
      trigger: 'at_or_below',
      direction: 'below',
      distance: '1',
      distanceRate: '0.01',
    });
  });

  test('se o próprio fechamento já dispara no candle hipotético, o preço é o limite do lado em que ele deixa de disparar', () => {
    expect(levelFor({ fires: (index) => index >= 9_990 })).toStrictEqual({
      status: 'price',
      price: '99.9',
      trigger: 'at_or_above',
      direction: 'below',
      distance: '0.1',
      distanceRate: '0.001',
    });
    expect(levelFor({ fires: (index) => index <= 10_010 })).toStrictEqual({
      status: 'price',
      price: '100.1',
      trigger: 'at_or_below',
      direction: 'above',
      distance: '0.1',
      distanceRate: '0.001',
    });
  });

  test('a taxa da distância sobe para CIMA a 8 casas', () => {
    expect(
      levelFor({ fires: (index) => index >= 301, lastClose: new EngineDecimal('3'), origin: 300 }),
    ).toMatchObject({ price: '3.01', distance: '0.01', distanceRate: '0.00333334' });
  });

  test('dispara em qualquer preço: já ativo; em nenhum: inalcançável', () => {
    expect(levelFor({ fires: () => true }).status).toBe('already_active');
    expect(levelFor({ fires: () => false })).toStrictEqual({
      status: 'unreachable',
      price: null,
      trigger: null,
      direction: null,
      distance: null,
      distanceRate: null,
    });
  });

  test('fora da faixa de busca é inalcançável; no limite dela, não', () => {
    expect(levelFor({ fires: (index) => index > PRICE_MAXIMUM }).status).toBe('unreachable');
    expect(levelFor({ fires: (index) => index === PRICE_MAXIMUM })).toMatchObject({
      status: 'price',
      price: '400',
    });
  });
});
