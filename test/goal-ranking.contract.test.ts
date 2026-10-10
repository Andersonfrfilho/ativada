// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, test } from 'bun:test';

import { createSeededRandom } from './fixtures/backtest/synthetic-candles.fixture.js';
import { loadGoalApi } from './fixtures/strategy-engine/goal/goal-api.fixture.js';

const api = await loadGoalApi();

type Item = {
  readonly key: string;
  readonly evaluation: {
    readonly windowCount: number;
    readonly reachedCount: number;
    readonly stoppedCount: number;
  };
};

function item(key: string, windowCount: number, reachedCount: number, stoppedCount: number): Item {
  return { key, evaluation: { windowCount, reachedCount, stoppedCount } };
}

function orderOf(items: readonly Item[]): string[] {
  return api.rankGoalCombinations(items).map((entry) => entry.key);
}

describe('o ranking das combinações: chegada maior primeiro, desempate pelo stop menor', () => {
  test('ordena pela fração EXATA de chegada, não pela taxa arredondada', () => {
    // 2/3 = 0,6667 > 133/200 = 0,665, e 7/10 = 0,7 vence os dois
    expect(
      orderOf([item('b', 200, 133, 0), item('a', 3, 2, 0), item('c', 10, 7, 0)]),
    ).toStrictEqual(['c', 'a', 'b']);
  });

  test('frações iguais com contagens diferentes empatam na chegada (1/2 = 50/100)', () => {
    expect(orderOf([item('x', 100, 50, 30), item('y', 2, 1, 0)])).toStrictEqual(['y', 'x']);
  });

  test('empate na chegada: menor taxa de stop primeiro', () => {
    expect(
      orderOf([item('alto', 100, 40, 30), item('baixo', 100, 40, 10), item('meio', 100, 40, 20)]),
    ).toStrictEqual(['baixo', 'meio', 'alto']);
  });

  test('empate também no stop: mais janelas primeiro (mais evidência)', () => {
    expect(orderOf([item('curta', 50, 25, 5), item('longa', 100, 50, 10)])).toStrictEqual([
      'longa',
      'curta',
    ]);
  });

  test('empate total: pela chave, em ordem estável e independente de locale', () => {
    expect(orderOf([item('b', 10, 5, 1), item('B', 10, 5, 1), item('a', 10, 5, 1)])).toStrictEqual([
      'B',
      'a',
      'b',
    ]);
  });

  test('combinação sem nenhuma janela vai por último, qualquer que seja o resto', () => {
    expect(
      orderOf([item('vazia', 0, 0, 0), item('ruim', 100, 0, 100), item('boa', 100, 90, 0)]),
    ).toStrictEqual(['boa', 'ruim', 'vazia']);
  });

  test('não altera a lista recebida e devolve cópia', () => {
    const input = [item('b', 10, 1, 0), item('a', 10, 9, 0)];
    const ranked = api.rankGoalCombinations(input);
    expect(input.map((entry) => entry.key)).toStrictEqual(['b', 'a']);
    expect(ranked).not.toBe(input);
  });

  test('a ordem não depende da ordem de entrada (500 embaralhamentos)', () => {
    const random = createSeededRandom(2026);
    const base = Array.from({ length: 12 }, (_unused, index) => {
      const windows = 10 + Math.floor(random() * 90);
      const reached = Math.floor(random() * (windows + 1));
      const stopped = Math.floor(random() * (windows - reached + 1));
      return item(`k${String(index).padStart(2, '0')}`, windows, reached, stopped);
    });
    const expected = orderOf(base);
    for (let round = 0; round < 500; round += 1) {
      const shuffled = [...base].sort(() => random() - 0.5);
      expect(orderOf(shuffled)).toStrictEqual(expected);
    }
  });
});
