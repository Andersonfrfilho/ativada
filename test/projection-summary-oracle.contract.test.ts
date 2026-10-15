// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, test } from 'bun:test';

import {
  PROJECTION_SUMMARY_GOLDEN,
  type ProjectionGoldenKey,
} from './fixtures/projections/projection-summary-golden.fixture.js';
import {
  buildOraclePredictions,
  PROJECTION_DATASET_KEYS,
  PROJECTION_STRATEGIES,
} from './fixtures/projections/projection-dataset.fixture.js';
import {
  isInsideBand,
  rateOf,
  strengthOf,
  summarizeOracle,
  verdictOf,
} from './fixtures/projections/projection-summary-oracle.fixture.js';
import { REAL_DATASETS } from './fixtures/strategy-engine/signal/classic-signals.fixture.js';

// T0.1 da spec 009 (ADR 0002, "Gráfico estilo Binance (spec 009)"): o oráculo do resumo de acertos e o resultado dele
// nos dois conjuntos reais, com o Placar clássico e o Donchian + MACD. A consulta SQL (T1.2) tem de devolver os mesmos números.

describe('oráculo do resumo nos conjuntos reais (dourado)', () => {
  for (const [datasetIndex, dataset] of REAL_DATASETS.entries()) {
    const datasetKey = PROJECTION_DATASET_KEYS[datasetIndex];
    if (datasetKey === undefined) throw new Error('conjunto real sem chave no dourado');
    for (const [strategyName, strategy] of PROJECTION_STRATEGIES) {
      test(`${dataset.name} · ${strategyName}`, () => {
        const key: ProjectionGoldenKey = `${datasetKey}:${strategyName}`;
        const summary = summarizeOracle(buildOraclePredictions(dataset, strategy));
        expect(summary.counted).toBe(summary.hits + summary.misses);
        expect(summary).toStrictEqual(PROJECTION_SUMMARY_GOLDEN[key]);
      });
    }
  }
});

describe('regras do oráculo à mão', () => {
  test('força pela fração do limiar do lado: ≤ 0,5 fraco, < 1 forte, senão decidiu', () => {
    expect(strengthOf({ score: '1', threshold: '2' })).toBe('weak');
    expect(strengthOf({ score: '1.5', threshold: '2' })).toBe('strong');
    expect(strengthOf({ score: '2', threshold: '2' })).toBe('decided');
    expect(strengthOf({ score: '-0.5', threshold: '-1.5' })).toBe('weak');
    expect(strengthOf({ score: '-1', threshold: '-1.5' })).toBe('strong');
    expect(strengthOf({ score: '-2.5', threshold: '-1.5' })).toBe('decided');
  });

  test('faixa nunca encolhe: borda de baixo para baixo e de cima para cima a 8 casas', () => {
    const band = { close: '100', atr: '0.123456789' };
    expect(isInsideBand({ ...band, nextClose: '99.87654321' })).toBe(true);
    expect(isInsideBand({ ...band, nextClose: '99.87654320' })).toBe(false);
    expect(isInsideBand({ ...band, nextClose: '100.12345679' })).toBe(true);
    expect(isInsideBand({ ...band, nextClose: '100.1234568' })).toBe(false);
  });

  test('taxas a 4 casas (2 em porcentagem) para baixo', () => {
    expect(rateOf(171, 346)).toBe('0.4942');
    expect(rateOf(2, 3)).toBe('0.6666');
    expect(rateOf(3, 3)).toBe('1');
    expect(rateOf(0, 5)).toBe('0');
    expect(rateOf(0, 0)).toBeNull();
  });

  test('veredito de Wilson nas bordas', () => {
    expect(verdictOf({ hits: 29, counted: 29 })).toBe('too_few');
    expect(verdictOf({ hits: 30, counted: 30 })).toBe('above');
    expect(verdictOf({ hits: 0, counted: 30 })).toBe('below');
    expect(verdictOf({ hits: 15, counted: 30 })).toBe('even');
    // n = 30: a partir de 21 acertos o limite inferior passa de 0,5 (k = 20 → 0,4878; k = 21 → 0,5212).
    expect(verdictOf({ hits: 20, counted: 30 })).toBe('even');
    expect(verdictOf({ hits: 21, counted: 30 })).toBe('above');
    expect(verdictOf({ hits: 10, counted: 30 })).toBe('even');
    expect(verdictOf({ hits: 9, counted: 30 })).toBe('below');
    // O preview da spec 009: 171 de 346 → intervalo 44,2% a 54,7%.
    expect(verdictOf({ hits: 171, counted: 346 })).toBe('even');
  });

  test('empate e sem lado não contam; sem vela seguinte fica pendente', () => {
    const base = { candleTime: 0, close: '10', atr: '1', buyThreshold: '2', sellThreshold: '-2' };
    const summary = summarizeOracle([
      { ...base, score: '1', nextClose: '11' },
      { ...base, score: '-1', nextClose: '11' },
      { ...base, score: '2', nextClose: '10' },
      { ...base, score: '0', nextClose: '9' },
      { ...base, score: '1', nextClose: undefined },
      { ...base, score: '-2', atr: null, nextClose: '12' },
    ]);
    expect(summary).toStrictEqual({
      predictions: 6,
      noSide: 1,
      pending: 1,
      counted: 3,
      hits: 1,
      misses: 2,
      ties: 1,
      upMoves: 3,
      banded: 3,
      inside: 3,
      hitRate: '0.3333',
      upRate: '1',
      insideRate: '1',
      byStrength: {
        weak: { counted: 2, hits: 1 },
        strong: { counted: 0, hits: 0 },
        decided: { counted: 1, hits: 0 },
      },
      verdict: 'too_few',
    });
  });
});
