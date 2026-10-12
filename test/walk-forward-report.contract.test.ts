// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, test } from 'bun:test';

import type { EngineCandle } from '../packages/strategy-engine/src/index.js';
import { digestCandles } from '../scripts/walk-forward-report/candle-digest.js';
import { formatPercent } from '../scripts/walk-forward-report/format-values.js';
import { buildNeighborPlans, toFixedGrid } from '../scripts/walk-forward-report/neighbor-plans.js';
import { renderReport } from '../scripts/walk-forward-report/render-report.js';
import type {
  ReportInput,
  RunSummary,
  ScenarioReport,
  WindowSummary,
} from '../scripts/walk-forward-report/report.types.js';
import {
  computeBuyAndHoldReturn,
  computeWindowStats,
  countEdgeWindows,
} from '../scripts/walk-forward-report/window-stats.js';

const CANDLE: EngineCandle = {
  symbol: 'BTCUSDT',
  timeframe: '1h',
  openTime: 1_000,
  closeTime: 3_599_999,
  open: '100.00000000',
  high: '110.00000000',
  low: '90.00000000',
  close: '105.00000000',
  volume: '12.50000000',
};

function window(overrides: Partial<WindowSummary>): WindowSummary {
  return {
    index: 0,
    trainStart: Date.UTC(2025, 0, 1),
    testStart: Date.UTC(2025, 6, 1),
    testEnd: Date.UTC(2025, 8, 1),
    isEligible: true,
    assignment: { 'thresholds.buy': '2' },
    inSampleSharpe: '1.5',
    inSampleTrades: 12,
    trades: 3,
    totalReturn: '-0.02',
    benchmarkReturn: '0.04',
    maxDrawdown: '0.05',
    winRate: '0.333333333333',
    ...overrides,
  };
}

function summary(windows: readonly WindowSummary[], totalReturn: string): RunSummary {
  return {
    windows,
    totalReturn,
    benchmarkReturn: '0.10',
    excessReturn: '-0.12',
    annualizedReturn: '-0.01',
    sharpe: '-0.4',
    sortino: '-0.5',
    winRate: '0.4',
    profitFactor: '0.8',
    exposure: '0.3',
    maxDrawdownDepth: '0.07',
    maxDrawdownDays: 40,
    trades: 9,
    feesPaid: '55.5',
    netProfit: '-200',
    testCandles: 1000,
    liquidatedAtWindowEnd: 1,
    overfitting: {
      isAlert: true,
      reasons: ['sharpe_below_half_of_in_sample'],
      inSampleSharpe: '1.5',
      outOfSampleSharpe: '-0.4',
      degradation: '-0.27',
      eligibleWindows: 2,
      totalWindows: 2,
    },
  };
}

function scenario(): ScenarioReport {
  const windows = [window({ index: 0 }), window({ index: 1, totalReturn: '0.03' })];
  return {
    symbol: 'BTCUSDT',
    timeframe: '1h',
    candleCount: 17_000,
    firstOpenTime: Date.UTC(2024, 9, 12),
    lastCloseTime: Date.UTC(2026, 9, 12),
    digest: 'abc123digest',
    periodStart: Date.UTC(2024, 9, 23),
    periodEnd: Date.UTC(2026, 9, 12),
    leadInCandles: 194,
    combinations: 162,
    minTradesPerWindow: 10,
    buyAndHoldWholePeriod: '0.30',
    withCosts: summary(windows, '-0.05'),
    withoutCosts: summary(windows, '0.01'),
    neighbors: [
      { label: 'parâmetros de fábrica', changedPath: null, summary: summary(windows, '-0.04') },
      {
        label: 'fastPeriod=6',
        changedPath: 'rules.ema-9-21.fastPeriod',
        summary: summary(windows, '-0.20'),
      },
    ],
    elapsedSeconds: 120,
  };
}

const INPUT: ReportInput = {
  generatedAt: '2026-10-12T05:00:00.000Z',
  dataUntil: '2026-10-12T04:00:00.000Z',
  commit: 'deadbeef',
  isTreeClean: true,
  engineVersions: 'engine-1 / signal-1 / metrics-1',
  scenarios: [scenario()],
};

describe('digestCandles', () => {
  test('é determinístico e sensível a qualquer campo, remoção ou ordem', () => {
    const other: EngineCandle = { ...CANDLE, openTime: 4_000_000, closeTime: 7_599_999 };
    const base = digestCandles([CANDLE, other]);
    expect(digestCandles([CANDLE, other])).toBe(base);
    expect(digestCandles([other, CANDLE])).not.toBe(base);
    expect(digestCandles([CANDLE])).not.toBe(base);
    expect(digestCandles([{ ...CANDLE, close: '105.00000001' }, other])).not.toBe(base);
    expect(base).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('buildNeighborPlans', () => {
  const parameters = [
    { path: 'a', values: [1, 2, 3] },
    { path: 'b', values: ['x', 'y'] },
  ];
  test('linha-base mais um plano por outro valor, mudando só um parâmetro', () => {
    const plans = buildNeighborPlans({ parameters, baseline: { a: 2, b: 'x' } });
    expect(plans).toHaveLength(1 + 2 + 1);
    expect(plans[0]?.changedPath).toBeNull();
    for (const plan of plans.slice(1)) {
      const differing = Object.entries(plan.assignment).filter(
        ([path, value]) => ({ a: 2, b: 'x' })[path as 'a' | 'b'] !== value,
      );
      expect(differing).toHaveLength(1);
      expect(differing[0]?.[0]).toBe(plan.changedPath ?? undefined);
    }
  });
  test('a grade fixa tem exatamente uma combinação', () => {
    const grid = toFixedGrid({ a: 2, b: 'x' });
    expect(grid.parameters.map((item) => item.values.length)).toEqual([1, 1]);
  });
});

describe('estatísticas por janela', () => {
  test('conta janelas positivas, perdidas fora da amostra e abaixo de comprar e segurar', () => {
    const stats = computeWindowStats([
      window({ totalReturn: '-0.02' }),
      window({ totalReturn: '0.03', benchmarkReturn: '0.01' }),
      window({ isEligible: false, inSampleSharpe: null, totalReturn: '0', trades: 0 }),
    ]);
    expect(stats.windows).toBe(3);
    expect(stats.eligibleWindows).toBe(2);
    expect(stats.positiveWindows).toBe(1);
    expect(stats.lostOutOfSample).toBe(1);
    expect(stats.belowBenchmark).toBe(2);
    expect(Number(stats.meanReturn)).toBeCloseTo(0.01 / 3, 9);
    expect(Number(stats.medianReturn)).toBe(0);
    expect(Number(stats.worstReturn)).toBe(-0.02);
  });
  test('comprar e segurar usa a abertura do primeiro candle e o último fechamento', () => {
    const later: EngineCandle = { ...CANDLE, openTime: 5_000_000, close: '150.00000000' };
    expect(Number(computeBuyAndHoldReturn([CANDLE, later], 0))).toBeCloseTo(0.5, 9);
    expect(computeBuyAndHoldReturn([CANDLE], 9_000_000)).toBeNull();
  });
});

describe('formatPercent', () => {
  test('formata em pt-BR com sinal e trata ausência', () => {
    expect(formatPercent('-0.0312')).toBe('-3,12%');
    expect(formatPercent(null)).toBe('n/d');
  });
});

describe('renderReport', () => {
  const text = renderReport(INPUT);
  test('traz as seções obrigatórias em linguagem clara', () => {
    for (const heading of [
      'O que foi testado',
      'Resultado fora da amostra',
      'Comparação com comprar e segurar',
      'Alerta de overfitting',
      'Impacto dos custos',
      'Sensibilidade',
      'Limitação',
      'O que isto NÃO prova',
      'Rastreabilidade',
    ]) {
      expect(text).toContain(heading);
    }
  });
  test('registra o hash do dado e do código e não promete lucro', () => {
    expect(text).toContain('abc123digest');
    expect(text).toContain('deadbeef');
    expect(text.toLowerCase()).not.toContain('garant');
    expect(text.toLowerCase()).not.toContain('lucro certo');
  });
  test('é determinístico', () => {
    expect(renderReport(INPUT)).toBe(text);
  });
  test('avisa quando a árvore de código não estava limpa', () => {
    expect(renderReport({ ...INPUT, isTreeClean: false })).toContain('NÃO estava limpa');
  });
});

describe('leitura honesta dos casos difíceis', () => {
  function withOverfitting(inSampleSharpe: string | null, isAlert: boolean): ReportInput {
    const base = scenario();
    const withCosts = {
      ...base.withCosts,
      overfitting: { ...base.withCosts.overfitting, inSampleSharpe, isAlert },
    };
    return { ...INPUT, scenarios: [{ ...base, withCosts }] };
  }

  test('alerta apagado com Sharpe de ajuste não positivo é explicado como ausência de vantagem', () => {
    const text = renderReport(withOverfitting('-1.2', false));
    expect(text).toContain('não indica robustez');
    expect(renderReport(withOverfitting('1.2', false))).not.toContain('não indica robustez');
  });

  test('resultado de custo melhor que o sem custo não é atribuído aos custos', () => {
    const base = scenario();
    const input: ReportInput = {
      ...INPUT,
      scenarios: [{ ...base, withoutCosts: summary(base.withoutCosts.windows, '-0.20') }],
    };
    expect(renderReport(input)).toContain('_melhor_ que sem custos');
  });

  test('poucas operações geram aviso de pouca confiança estatística', () => {
    expect(renderReport(INPUT)).toContain('Pouca confiança estatística');
  });

  test('conta janelas com parâmetro vencedor na borda da grade', () => {
    const edge = window({ assignment: { 'thresholds.buy': '2.5' } });
    const middle = window({ assignment: { 'thresholds.buy': '2' } });
    expect(countEdgeWindows([edge, middle, edge])).toBe(2);
  });
});
