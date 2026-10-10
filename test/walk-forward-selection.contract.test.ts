// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, test } from 'bun:test';

import type { ParameterCandidate } from '../packages/strategy-engine/src/index.js';
import {
  createRandom,
  loadWalkForwardEngineApi,
  pickInteger,
} from './fixtures/walk-forward/walk-forward-api.fixture.js';

const { DEFAULT_MIN_TRADES_PER_WINDOW, selectBestParameters } = await loadWalkForwardEngineApi();

const PROPERTY_CASES = 1_500;

function candidate(
  combinationIndex: number,
  trades: number,
  sharpe: string | null,
  maxDrawdownAtLow = '0.05',
): ParameterCandidate {
  return { combinationIndex, trades, sharpe, maxDrawdownAtLow };
}

describe('objetivo: Sharpe líquido no AJUSTE, com mínimo de operações', () => {
  test('o mínimo padrão é 10', () => {
    expect(DEFAULT_MIN_TRADES_PER_WINDOW).toBe(10);
  });

  test('combinação com menos operações é INELEGÍVEL, mesmo com o melhor Sharpe', () => {
    const selection = selectBestParameters({
      candidates: [candidate(0, 9, '9.9'), candidate(1, 10, '1.5'), candidate(2, 30, '1.4')],
      minTradesPerWindow: 10,
    });
    expect(selection).toMatchObject({ status: 'ok', eligibleCount: 2 });
    expect(selection.status === 'ok' && selection.best.combinationIndex).toBe(1);
  });

  test('Sharpe indefinido não compete, mesmo com operações de sobra', () => {
    const selection = selectBestParameters({
      candidates: [candidate(0, 50, null), candidate(1, 10, '-0.3')],
      minTradesPerWindow: 10,
    });
    expect(selection.status === 'ok' && selection.best.combinationIndex).toBe(1);
  });

  test('NENHUMA elegível: a janela é marcada e nunca escolhe a "menos pior"', () => {
    const selection = selectBestParameters({
      candidates: [candidate(0, 9, '3'), candidate(1, 3, '4'), candidate(2, 50, null)],
      minTradesPerWindow: 10,
    });
    expect(selection).toEqual({ status: 'no_eligible_parameters', eligibleCount: 0 });
  });

  test('sem candidatos também não escolhe nada', () => {
    expect(selectBestParameters({ candidates: [], minTradesPerWindow: 10 }).status).toBe(
      'no_eligible_parameters',
    );
  });

  test('Sharpe negativo elegível ainda vence outro mais negativo (a escolha é do melhor, não do positivo)', () => {
    const selection = selectBestParameters({
      candidates: [candidate(0, 12, '-2'), candidate(1, 12, '-0.5')],
      minTradesPerWindow: 10,
    });
    expect(selection.status === 'ok' && selection.best.combinationIndex).toBe(1);
  });
});

describe('desempate DETERMINÍSTICO', () => {
  test('mais operações, depois menor drawdown na mínima, depois a primeira da grade', () => {
    const tied = [
      candidate(4, 12, '1.5', '0.03'),
      candidate(2, 14, '1.5', '0.09'),
      candidate(6, 14, '1.5', '0.04'),
      candidate(3, 14, '1.5', '0.04'),
      candidate(1, 14, '1.4999999999', '0.001'),
    ];
    const selection = selectBestParameters({ candidates: tied, minTradesPerWindow: 10 });
    expect(selection.status === 'ok' && selection.best.combinationIndex).toBe(3);
  });

  test('empate perfeito escolhe a de menor índice, qualquer que seja a ordem da lista', () => {
    const items = [candidate(5, 11, '2'), candidate(2, 11, '2'), candidate(9, 11, '2')];
    for (const ordered of [items, [...items].reverse(), [items[1], items[2], items[0]]]) {
      const selection = selectBestParameters({
        candidates: ordered.filter((item): item is ParameterCandidate => item !== undefined),
        minTradesPerWindow: 10,
      });
      expect(selection.status === 'ok' && selection.best.combinationIndex).toBe(2);
    }
  });

  test('compara decimais EXATOS (nenhum float)', () => {
    const selection = selectBestParameters({
      candidates: [
        candidate(0, 10, '0.100000000001'),
        candidate(1, 10, '0.100000000002'),
        candidate(2, 10, '0.1'),
      ],
      minTradesPerWindow: 10,
    });
    expect(selection.status === 'ok' && selection.best.combinationIndex).toBe(1);
  });
});

describe('propriedades', () => {
  test(`${PROPERTY_CASES} listas aleatórias: invariante à ordem, elegível e de Sharpe máximo`, () => {
    const random = createRandom(20_261_015);
    for (let round = 0; round < PROPERTY_CASES; round += 1) {
      const candidates = Array.from({ length: pickInteger(random, 0, 12) }, (_unused, index) =>
        candidate(
          index,
          pickInteger(random, 0, 25),
          random() < 0.1 ? null : (pickInteger(random, -30, 30) / 10).toString(),
          (pickInteger(random, 1, 20) / 100).toString(),
        ),
      );
      const shuffled = [...candidates].sort(() => random() - 0.5);
      const selection = selectBestParameters({ candidates, minTradesPerWindow: 10 });
      expect(selectBestParameters({ candidates: shuffled, minTradesPerWindow: 10 })).toEqual(
        selection,
      );
      const eligible = candidates.filter((item) => item.trades >= 10 && item.sharpe !== null);
      if (selection.status !== 'ok') {
        expect(eligible).toHaveLength(0);
        continue;
      }
      expect(selection.eligibleCount).toBe(eligible.length);
      expect(selection.best.trades).toBeGreaterThanOrEqual(10);
      const bestSharpe = Math.max(...eligible.map((item) => Number(item.sharpe)));
      expect(Number(selection.best.sharpe)).toBe(bestSharpe);
    }
  });
});
