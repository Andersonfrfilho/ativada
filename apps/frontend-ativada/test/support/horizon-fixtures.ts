// Copyright (c) 2026 Ada Technology. All rights reserved.
export const STRATEGY_REF = {
  id: 'strategy-1',
  name: 'Momentum rápido',
  versionId: 'version-1',
  version: 2,
};

export function buildIntradayRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    kind: 'intraday',
    timeframe: '15m',
    days: 90,
    strategy: STRATEGY_REF,
    netReturn: '-0.012',
    tradeCount: 41,
    feesPaid: '31.5',
    feeShareOfGross: null,
    verdict: 'NAO_COMPENSA',
    message:
      'Operar de 15 em 15 minutos: não compensa (a estratégia perdeu dinheiro mesmo antes das taxas).',
    ...overrides,
  };
}

export function buildDailyRow(
  horizonDays: number,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    kind: 'daily',
    horizonDays,
    strategy: STRATEGY_REF,
    windowCount: 400,
    positiveCount: 232,
    median: '0.0041',
    positiveRate: '0.58',
    worstDecile: '-0.07',
    isShortHistory: false,
    benchmark: { median: '0.002', positiveRate: '0.51', worstDecile: '-0.12' },
    isRecommended: false,
    message: `Por ${horizonDays} dias: em geral +0,4%, positivo em 58% das vezes.`,
    ...overrides,
  };
}

// Spec §7.2, primeiro caso: só 30 dias passa na regra e leva o selo.
export function buildRecommendedHorizons(): Record<string, unknown> {
  return {
    symbol: 'BTCUSDT',
    evaluatedStrategies: 1,
    isStrategyListTruncated: false,
    rows: [
      buildIntradayRow(),
      buildDailyRow(7, {
        median: '-0.001',
        positiveRate: '0.4',
        message: 'Por 7 dias: em geral -0,1%, positivo em 40% das vezes.',
      }),
      buildDailyRow(15, {
        median: '0.0002',
        positiveRate: '0.5',
        worstDecile: '-0.2',
        message: 'Por 15 dias: em geral +0,0%, positivo em 50% das vezes.',
      }),
      buildDailyRow(30, {
        isRecommended: true,
        message:
          'Por 30 dias: em geral +0,4%, positivo em 58% das vezes. É o prazo mais recomendável no histórico.',
      }),
    ],
    recommendedHorizonDays: 30,
    recommendationMessage: 'O prazo mais recomendável no histórico desta moeda é de 30 dias.',
    unavailable: [],
  };
}

// Spec §7.2, segundo caso: nenhum prazo passa na regra.
export function buildNoneRecommendedHorizons(): Record<string, unknown> {
  return {
    symbol: 'BTCUSDT',
    evaluatedStrategies: 1,
    isStrategyListTruncated: false,
    rows: [
      buildIntradayRow(),
      buildDailyRow(7, {
        median: '-0.01',
        positiveRate: '0.3',
        message: 'Por 7 dias: em geral -1,0%, positivo em 30% das vezes.',
      }),
      buildDailyRow(15, {
        median: '-0.02',
        positiveRate: '0.35',
        message: 'Por 15 dias: em geral -2,0%, positivo em 35% das vezes.',
      }),
      buildDailyRow(30, {
        median: '-0.03',
        positiveRate: '0.2',
        message: 'Por 30 dias: em geral -3,0%, positivo em 20% das vezes.',
      }),
    ],
    recommendedHorizonDays: null,
    recommendationMessage: 'Nenhum prazo compensou no histórico desta moeda.',
    unavailable: [],
  };
}
