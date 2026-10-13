// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, test } from 'bun:test';

import {
  bucketOf,
  canonicalDecimal,
  referenceFillClusters,
  referencePriceColumns,
  type OracleCandle,
} from './fixtures/run-chart/chart-oracle.fixture.js';

function candle(openTime: number, prices: readonly [string, string, string, string]): OracleCandle {
  const [open, high, low, close] = prices;
  return { openTime, open, high, low, close };
}

describe('oráculo do gráfico — contas à mão', () => {
  test('o balde é o piso de ((t - from) * columns) / (to - from)', () => {
    const range = { from: 0, to: 10 };
    const buckets = Array.from({ length: 10 }, (_unused, time) =>
      bucketOf({ time, range, columns: 4 }),
    );
    expect(buckets).toStrictEqual([0, 0, 0, 1, 1, 2, 2, 2, 3, 3]);
  });

  test('o balde respeita o deslocamento de `from` e nunca chega a `columns`', () => {
    const range = { from: 1_000, to: 1_007 };
    const buckets = Array.from({ length: 7 }, (_unused, index) =>
      bucketOf({ time: 1_000 + index, range, columns: 3 }),
    );
    expect(buckets).toStrictEqual([0, 0, 0, 1, 1, 2, 2]);
    expect(Math.max(...buckets)).toBe(2);
  });

  test('primeiro, último, mínima e máxima por coluna, em grafia canônica', () => {
    const candles = [
      candle(0, ['10.50000000', '11.00000000', '10.00000000', '10.70000000']),
      candle(1, ['10.70000000', '12.25000000', '10.60000000', '12.00000000']),
      candle(2, ['12.00000000', '12.00000000', '9.99999999', '10.00000000']),
      candle(3, ['10.00000000', '10.10000000', '9.90000000', '10.05000000']),
    ];
    const columns = referencePriceColumns({ candles, range: { from: 0, to: 4 }, columns: 2 });
    expect(columns).toStrictEqual([
      { startTime: 0, endTime: 1, first: '10.5', last: '12', low: '10', high: '12.25' },
      { startTime: 2, endTime: 3, first: '12', last: '10.05', low: '9.9', high: '12' },
    ]);
  });

  test('coluna sem vela não existe e faixa menor que `columns` dá uma coluna por vela', () => {
    const candles = [candle(0, ['1', '2', '1', '2']), candle(9, ['3', '4', '3', '4'])];
    const columns = referencePriceColumns({ candles, range: { from: 0, to: 10 }, columns: 100 });
    expect(columns.map((column) => [column.startTime, column.endTime])).toStrictEqual([
      [0, 0],
      [9, 9],
    ]);
  });

  test('vela fora de [from, to) não entra: `to` é excluído', () => {
    const candles = [candle(5, ['1', '1', '1', '1']), candle(10, ['9', '9', '9', '9'])];
    const columns = referencePriceColumns({ candles, range: { from: 5, to: 10 }, columns: 4 });
    expect(columns).toHaveLength(1);
    expect(columns[0]?.high).toBe('1');
  });

  test('agrupamento de preenchimentos pelo mesmo balde', () => {
    const fills = [
      { side: 'buy', candleTime: 0 },
      { side: 'sell', candleTime: 2 },
      { side: 'buy', candleTime: 5 },
      { side: 'sell', candleTime: 9 },
      { side: 'buy', candleTime: 10 },
    ];
    expect(referenceFillClusters({ fills, range: { from: 0, to: 10 }, columns: 4 })).toStrictEqual([
      { bucket: 0, buys: 1, sells: 1 },
      { bucket: 2, buys: 1, sells: 0 },
      { bucket: 3, buys: 0, sells: 1 },
    ]);
  });

  test('grafia canônica', () => {
    expect(canonicalDecimal('30000.10000000')).toBe('30000.1');
    expect(canonicalDecimal('30000.00000000')).toBe('30000');
    expect(canonicalDecimal('0.00000000')).toBe('0');
    expect(canonicalDecimal('100')).toBe('100');
  });
});
