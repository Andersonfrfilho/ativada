// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, test } from 'bun:test';

import { computeWilsonInterval, judgeAgainstCoinFlip } from '../packages/statistics/src/index.js';
import { PROJECTION_SUMMARY_GOLDEN } from './fixtures/projections/projection-summary-golden.fixture.js';
import {
  AUDITOR_GOLDEN,
  parseAuditorGolden,
} from './fixtures/risk-analyst/auditor-golden.fixture.js';
import {
  summarizeAuditor,
  verdictOf,
  weightOf,
  wilsonLimitsOf,
  type AuditorCandle,
} from './fixtures/risk-analyst/auditor-oracle.fixture.js';
import { ORACLE_SPECIALIST_KEYS } from './fixtures/risk-analyst/specialist-catalog.fixture.js';
import {
  AUDITED_KEYS,
  buildAuditorSeries,
  lastCandleWindow,
  leadInOf,
  syntheticSentiment,
} from './fixtures/risk-analyst/specialist-dataset.fixture.js';
import { REAL_DATASETS } from './fixtures/strategy-engine/signal/classic-signals.fixture.js';

// T0.1 da spec 007 (ADR 0002, "Analista de risco (spec 007)"): o oráculo do auditor de acertos, o resultado dele nos dois
// conjuntos reais e a prova de que ele e o Wilson ÚNICO (`@ativada/statistics`, spec 009 P10) dão os mesmos números.

const DATASET_KEYS = ['btcusdt-1h-500', 'ethusdt-1d-400'] as const;
const WINDOWS = [2880, 96] as const;
const D = 900_000;

describe('auditor nos conjuntos reais (dourado)', () => {
  for (const [datasetIndex, dataset] of REAL_DATASETS.entries()) {
    for (const key of AUDITED_KEYS) {
      const series = buildAuditorSeries(dataset, key);
      for (const windowCandles of WINDOWS) {
        const goldenKey = `${DATASET_KEYS[datasetIndex]}:${key}:${windowCandles}`;
        test(goldenKey, () => {
          const golden = AUDITOR_GOLDEN[goldenKey];
          if (golden === undefined) throw new Error(`sem dourado para ${goldenKey}`);
          const summary = summarizeAuditor(series, lastCandleWindow(dataset, windowCandles));
          expect(summary).toStrictEqual(parseAuditorGolden(golden));
        });
      }
    }
  }

  test('a tendência da estratégia repete a `projection-1` da spec 009 com a janela inteira', () => {
    const projectionKeys = ['btcusdt-1h-500:classic', 'ethusdt-1d-400:classic'] as const;
    for (const [datasetIndex, dataset] of REAL_DATASETS.entries()) {
      const summary = summarizeAuditor(
        buildAuditorSeries(dataset, 'strategy'),
        lastCandleWindow(dataset, 2880),
      );
      const projectionKey = projectionKeys[datasetIndex];
      if (projectionKey === undefined) throw new Error('conjunto real sem chave na projection-1');
      const projection = PROJECTION_SUMMARY_GOLDEN[projectionKey];
      expect([summary.counted, summary.hits, summary.upMoves, summary.verdict]).toStrictEqual([
        projection.counted,
        projection.hits,
        projection.upMoves,
        projection.verdict,
      ]);
    }
  });

  test('o aquecimento de todo especialista cabe nas 200 velas extras da série (plan D2)', () => {
    const leadIns = ORACLE_SPECIALIST_KEYS.map((key) => leadInOf(key));
    expect(leadIns).toStrictEqual([129, 97, 97, 97]);
  });

  test('o sentimento sintético passa por medo, neutro e ganância', () => {
    const values = Array.from(
      { length: 101 },
      (_, day) => syntheticSentiment(day * 86_400_000, 'x').value,
    );
    expect(values.some((value) => value <= 25)).toBe(true);
    expect(values.some((value) => value > 25 && value < 75)).toBe(true);
    expect(values.some((value) => value >= 75)).toBe(true);
  });
});

function candle(index: number, close: string, vote: AuditorCandle['vote']): AuditorCandle {
  return { openTime: index * D, close, vote };
}

describe('regras do auditor à mão', () => {
  test('janela: conta p em (t − (W + 1)·d, t − d]; a vela t ainda não tem resultado', () => {
    const series = [
      candle(0, '10', 1),
      candle(1, '11', 1),
      candle(2, '12', -1),
      candle(3, '11', 1),
      candle(4, '12', 1),
    ];
    const summary = summarizeAuditor(series, {
      decisionTime: 4 * D,
      timeframeMilliseconds: D,
      windowCandles: 3,
    });
    // p = 1 (sobe, acerto), 2 (desce, acerto), 3 (sobe, acerto); p = 0 fora da janela; p = 4 sem resultado.
    expect([summary.predictions, summary.hits, summary.misses, summary.upMoves]).toStrictEqual([
      3, 3, 0, 2,
    ]);
  });

  test('sem leitura, sem lado, lacuna e empate não contam', () => {
    const series = [
      candle(0, '10', null),
      candle(1, '10', 0),
      candle(2, '10', 1),
      candle(4, '10', -1),
      candle(5, '10', 1),
      candle(6, '10', 1),
    ];
    const summary = summarizeAuditor(series, {
      decisionTime: 6 * D,
      timeframeMilliseconds: D,
      windowCandles: 2880,
    });
    expect(summary).toMatchObject({ predictions: 5, unread: 1, noSide: 1, gap: 1, ties: 2 });
    expect([summary.counted, summary.hitRate, summary.verdict, summary.lower]).toStrictEqual([
      0,
      null,
      'too_few',
      null,
    ]);
  });

  test('veredito nas bordas: 29 contadas, 30 contadas e o limite encostando em 0,5', () => {
    expect(verdictOf({ hits: 29, counted: 29 })).toBe('too_few');
    expect(verdictOf({ hits: 30, counted: 30 })).toBe('above');
    expect(verdictOf({ hits: 20, counted: 30 })).toBe('even');
    expect(verdictOf({ hits: 21, counted: 30 })).toBe('above');
    expect(verdictOf({ hits: 10, counted: 30 })).toBe('even');
    expect(verdictOf({ hits: 9, counted: 30 })).toBe('below');
    expect(verdictOf({ hits: 171, counted: 346 })).toBe('even');
  });

  test('peso = limite inferior − 0,5 só em `above`', () => {
    const lower = wilsonLimitsOf({ hits: 21, counted: 30 }).lower;
    expect(lower.startsWith('0.5212')).toBe(true);
    expect(weightOf('above', lower)).toBe(`0.0${lower.slice(3)}`);
    expect(weightOf('above', '0.5')).toBe('0');
    expect(weightOf('even', '0.6')).toBe('0');
    expect(weightOf('too_few', '0.9')).toBe('0');
  });
});

describe('oráculo × Wilson único (`@ativada/statistics`)', () => {
  test('limites e veredito iguais para toda contagem até 120', () => {
    for (let counted = 1; counted <= 120; counted += 1) {
      for (let hits = 0; hits <= counted; hits += 1) {
        const oracle = {
          ...wilsonLimitsOf({ hits, counted }),
          verdict: verdictOf({ hits, counted }),
        };
        expect(judgeAgainstCoinFlip({ hits, counted })).toStrictEqual(oracle);
        expect(computeWilsonInterval({ successes: hits, total: counted })).toStrictEqual({
          lower: oracle.lower,
          upper: oracle.upper,
        });
      }
    }
  });
});
