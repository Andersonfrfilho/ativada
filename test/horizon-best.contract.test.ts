// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, test } from 'bun:test';

import type { GoalStrategyRef } from '../apps/api-ativada/src/goals/goal-evaluation-view.js';
import { loadApiApp } from './fixtures/api-routes/api-app.fixture.js';
import type {
  DailyHorizonResult,
  IntradayHorizonResult,
} from '../apps/api-ativada/src/horizons/horizon-evaluation.types.js';
import type { HorizonSummary, IntradaySummary } from '../packages/strategy-engine/src/index.js';

const app = await loadApiApp();
const { pickBestDaily, pickBestIntraday } = app.horizonBest;

function ref(id: string): GoalStrategyRef {
  return { id, name: `Estratégia ${id}`, versionId: `v-${id}`, version: 1 };
}

function daily(id: string, overrides: Partial<HorizonSummary> = {}): DailyHorizonResult {
  return {
    strategy: ref(id),
    summary: {
      horizonDays: 30,
      windowCount: 100,
      positiveCount: 60,
      median: '0.02',
      positiveRate: '0.6',
      worstDecile: '-0.05',
      isShortHistory: false,
      benchmark: { median: '0', positiveRate: '0.5', worstDecile: '-0.2' },
      ...overrides,
    },
  };
}

function intraday(id: string, overrides: Partial<IntradaySummary> = {}): IntradayHorizonResult {
  return {
    strategy: ref(id),
    summary: {
      netReturn: '-0.01',
      tradeCount: 10,
      feesPaid: '10',
      feeShareOfGross: null,
      verdict: 'NAO_COMPENSA',
      ...overrides,
    },
  };
}

describe('melhor estratégia por linha de dias', () => {
  test('sem candidata não há melhor', () => {
    expect(pickBestDaily([])).toBeUndefined();
  });

  test('vence a maior mediana entre as que passam na regra, em qualquer ordem de chegada', () => {
    const low = daily('a', { median: '0.01' });
    const high = daily('b', { median: '0.03' });
    expect(pickBestDaily([low, high])?.strategy.id).toBe('b');
    expect(pickBestDaily([high, low])?.strategy.id).toBe('b');
  });

  test('a que passa na regra vence a de mediana maior que não passa', () => {
    const eligible = daily('a', { median: '0.01' });
    const notEligible = daily('b', { median: '0.09', worstDecile: '-0.4' });
    expect(pickBestDaily([notEligible, eligible])?.strategy.id).toBe('a');
    const shortHistory = daily('c', { median: '0.09', isShortHistory: true });
    expect(pickBestDaily([shortHistory, eligible])?.strategy.id).toBe('a');
  });

  test('entre as que não passam, a de maior mediana; mediana ausente fica por último', () => {
    const worse = daily('a', { median: '-0.02', worstDecile: '-0.3' });
    const better = daily('b', { median: '-0.01', worstDecile: '-0.3' });
    const empty = daily('c', { median: null, worstDecile: null, windowCount: 0 });
    expect(pickBestDaily([empty, worse, better])?.strategy.id).toBe('b');
    expect(pickBestDaily([empty, worse])?.strategy.id).toBe('a');
  });

  test('o empate fica com o menor id, sem depender da ordem', () => {
    expect(pickBestDaily([daily('z'), daily('m')])?.strategy.id).toBe('m');
    expect(pickBestDaily([daily('m'), daily('z')])?.strategy.id).toBe('m');
  });

  test('compara decimais, não texto: 0.10 vence 0.09', () => {
    const nine = daily('a', { median: '0.09' });
    const ten = daily('b', { median: '0.10' });
    expect(pickBestDaily([nine, ten])?.strategy.id).toBe('b');
  });
});

describe('melhor estratégia da linha de 15 minutos', () => {
  test('a que compensa vence a de líquido maior que não compensa', () => {
    const worth = intraday('a', { verdict: 'COMPENSA', netReturn: '0.01' });
    const notWorth = intraday('b', { verdict: 'NAO_COMPENSA', netReturn: '0.05' });
    expect(pickBestIntraday([notWorth, worth])?.strategy.id).toBe('a');
  });

  test('sem nenhuma que compense, vence o maior líquido (a menor perda)', () => {
    const big = intraday('a', { netReturn: '-0.30' });
    const small = intraday('b', { netReturn: '-0.02' });
    const none = intraday('c', { netReturn: null });
    expect(pickBestIntraday([big, none, small])?.strategy.id).toBe('b');
  });

  test('sem candidata não há melhor, e o empate fica com o menor id', () => {
    expect(pickBestIntraday([])).toBeUndefined();
    expect(pickBestIntraday([intraday('z'), intraday('m')])?.strategy.id).toBe('m');
  });
});
