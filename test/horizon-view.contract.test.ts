// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, test } from 'bun:test';

import type { GoalStrategyRef } from '../apps/api-ativada/src/goals/goal-evaluation-view.js';
import type { HorizonEvaluation } from '../apps/api-ativada/src/horizons/horizon-evaluation.types.js';
import type { HorizonSummary, IntradaySummary } from '../packages/strategy-engine/src/index.js';
import { loadApiApp } from './fixtures/api-routes/api-app.fixture.js';

const app = await loadApiApp();
const { toHorizonsView } = app.horizonView;

const STRATEGY: GoalStrategyRef = {
  id: 'estrategia-1',
  name: 'Placar',
  versionId: 'v-1',
  version: 1,
};

function daily(horizonDays: number, median: string, positiveRate: string): HorizonSummary {
  return {
    horizonDays,
    windowCount: 100,
    positiveCount: 60,
    median,
    positiveRate,
    worstDecile: '-0.04',
    isShortHistory: false,
    benchmark: { median: '0.01', positiveRate: '0.5', worstDecile: '-0.2' },
  };
}

const INTRADAY: IntradaySummary = {
  netReturn: '-0.03',
  tradeCount: 40,
  feesPaid: '300',
  feeShareOfGross: '1.5',
  verdict: 'NAO_COMPENSA',
};

function evaluation(overrides: Partial<HorizonEvaluation> = {}): HorizonEvaluation {
  return {
    symbol: 'BTCUSDT',
    evaluatedStrategies: 1,
    isStrategyListTruncated: false,
    daily: [
      { strategy: STRATEGY, summary: daily(7, '0.004', '0.52') },
      { strategy: STRATEGY, summary: daily(15, '0.011', '0.58') },
      { strategy: STRATEGY, summary: daily(30, '0.023', '0.61') },
    ],
    intraday: { strategy: STRATEGY, summary: INTRADAY },
    recommendedHorizonDays: 30,
    unavailable: [],
    ...overrides,
  };
}

describe('a resposta dos prazos', () => {
  test('o caso do spec: 15 min não compensa e só o prazo de 30 dias leva o selo', () => {
    const view = toHorizonsView(evaluation());
    expect(
      view.rows.map((row) => (row.kind === 'daily' ? row.horizonDays : row.kind)),
    ).toStrictEqual(['intraday', 7, 15, 30]);
    expect(view.rows.map((row) => row.message)).toStrictEqual([
      'Operar de 15 em 15 minutos: não compensa (as taxas comem o ganho).',
      'Por 7 dias: em geral +0,4%, positivo em 52% das vezes.',
      'Por 15 dias: em geral +1,1%, positivo em 58% das vezes.',
      'Por 30 dias: em geral +2,3%, positivo em 61% das vezes. É o prazo mais recomendável no histórico.',
    ]);
    expect(
      view.rows.flatMap((row) =>
        row.kind === 'daily' && row.isRecommended ? [row.horizonDays] : [],
      ),
    ).toStrictEqual([30]);
    expect(view.recommendedHorizonDays).toBe(30);
    expect(view.recommendationMessage).toBe(
      'O prazo mais recomendável no histórico desta moeda é de 30 dias.',
    );
  });

  test('nenhum prazo recomendado: ninguém leva o selo e a frase diz isso', () => {
    const view = toHorizonsView(evaluation({ recommendedHorizonDays: undefined }));
    expect(view.rows.some((row) => row.kind === 'daily' && row.isRecommended)).toBe(false);
    expect(view.rows.every((row) => !row.message.includes('mais recomendável'))).toBe(true);
    expect(view.recommendedHorizonDays).toBeNull();
    expect(view.recommendationMessage).toBe('Nenhum prazo compensou no histórico desta moeda.');
  });

  test('a linha de 15 minutos nunca leva o selo, nem mesmo se compensa', () => {
    const view = toHorizonsView(
      evaluation({
        intraday: {
          strategy: STRATEGY,
          summary: { ...INTRADAY, verdict: 'COMPENSA', netReturn: '0.02', feeShareOfGross: '0.2' },
        },
        recommendedHorizonDays: undefined,
      }),
    );
    const intraday = view.rows[0];
    expect(intraday?.kind).toBe('intraday');
    expect(intraday).not.toHaveProperty('isRecommended');
    expect(intraday?.message).toContain('compensou');
  });

  test('sem candles de 15 minutos a linha rápida não aparece; sem estratégia, só a frase', () => {
    const noIntraday = toHorizonsView(evaluation({ intraday: undefined }));
    expect(noIntraday.rows.map((row) => row.kind)).toStrictEqual(['daily', 'daily', 'daily']);
    const empty = toHorizonsView(
      evaluation({
        evaluatedStrategies: 0,
        daily: [],
        intraday: undefined,
        recommendedHorizonDays: undefined,
      }),
    );
    expect(empty.rows).toStrictEqual([]);
    expect(empty.recommendationMessage).toBe(
      'Você ainda não tem estratégia para comparar os prazos desta moeda.',
    );
  });

  test('os números do motor passam sem mudança e os não calculados continuam nulos', () => {
    const view = toHorizonsView(evaluation({ unavailable: [{ strategyId: 'x', reason: 'R' }] }));
    const row = view.rows[3];
    expect(row).toMatchObject({
      kind: 'daily',
      windowCount: 100,
      positiveCount: 60,
      median: '0.023',
      positiveRate: '0.61',
      worstDecile: '-0.04',
      isShortHistory: false,
      benchmark: { median: '0.01', positiveRate: '0.5', worstDecile: '-0.2' },
    });
    expect(view.unavailable).toStrictEqual([{ strategyId: 'x', reason: 'R' }]);
    expect(view.symbol).toBe('BTCUSDT');
  });
});
