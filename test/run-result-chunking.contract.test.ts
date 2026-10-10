// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, test } from 'bun:test';

import {
  chunkRows,
  mergeMonotonic,
} from '../packages/database/src/run-results/run-result-merge.js';

const POSTGRES_PARAMETER_LIMIT = 65_535;
const MAXIMUM_ROWS_PER_STATEMENT = 5_000;

type Event = {
  readonly key: string;
  readonly rank: number;
  readonly price?: string;
  readonly note?: string;
};

function rowsOf(count: number): readonly number[] {
  return Array.from({ length: count }, (_unused, index) => index);
}

describe('chunkRows (blocos de gravação em lote, ADR 0002 §b)', () => {
  test('nenhum bloco passa de 5.000 linhas e a concatenação devolve todas, em ordem', () => {
    const chunks = chunkRows(rowsOf(17_520), 6);
    expect(Math.max(...chunks.map((chunk) => chunk.length))).toBeLessThanOrEqual(
      MAXIMUM_ROWS_PER_STATEMENT,
    );
    expect(chunks.flat()).toStrictEqual([...rowsOf(17_520)]);
  });

  test.each([1, 6, 11, 20, 40, 200])(
    'com %i colunas nenhum bloco ultrapassa o limite de parâmetros do protocolo',
    (columnCount) => {
      for (const chunk of chunkRows(rowsOf(30_000), columnCount)) {
        expect(chunk.length).toBeGreaterThanOrEqual(1);
        expect(chunk.length * columnCount).toBeLessThanOrEqual(
          Math.max(POSTGRES_PARAMETER_LIMIT, columnCount),
        );
        expect(Math.max(chunk.length * columnCount, 0)).toBeLessThan(POSTGRES_PARAMETER_LIMIT);
      }
    },
  );

  test('lista vazia não gera bloco', () => {
    expect(chunkRows([], 6)).toStrictEqual([]);
  });
});

describe('mergeMonotonic (eventos da mesma chave no mesmo lote)', () => {
  const rule = {
    keyOf: (event: Event): string => event.key,
    rankOf: (event: Event): number => event.rank,
  };

  test('o status mais avançado vence e completa os campos com o que o anterior trouxe', () => {
    const merged = mergeMonotonic<Event>(
      [
        { key: 'a', rank: 1, price: '7' },
        { key: 'a', rank: 0, note: 'criada' },
      ],
      rule,
    );
    expect(merged).toStrictEqual([{ key: 'a', rank: 1, price: '7', note: 'criada' }]);
  });

  test('empatados no mesmo nível, o primeiro vale', () => {
    const merged = mergeMonotonic<Event>(
      [
        { key: 'a', rank: 1, price: 'primeiro' },
        { key: 'a', rank: 1, price: 'segundo' },
      ],
      rule,
    );
    expect(merged).toStrictEqual([{ key: 'a', rank: 1, price: 'primeiro' }]);
  });

  test('chaves diferentes ficam separadas, na ordem em que apareceram', () => {
    const merged = mergeMonotonic<Event>(
      [
        { key: 'b', rank: 0 },
        { key: 'a', rank: 0 },
        { key: 'b', rank: 1 },
      ],
      rule,
    );
    expect(merged.map((event) => `${event.key}${event.rank}`)).toStrictEqual(['b1', 'a0']);
  });
});
