// Copyright (c) 2026 Ada Technology. All rights reserved.
export const DAY = 86_400_000;
export const START = Date.parse('2026-01-01T00:00:00.000Z');
export const END = Date.parse('2026-07-01T00:00:00.000Z');

export function metricValue(value: string | null, reason: string | null = null): unknown {
  return { value, reason };
}

export function buildMetrics(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    version: 'metrics-1',
    initialBalance: '10000.00',
    finalEquity: '10420.00',
    totalReturn: metricValue('0.042'),
    benchmarkReturn: metricValue('0.011'),
    excessReturn: metricValue('0.031'),
    annualizedReturn: metricValue('0.09'),
    sharpe: metricValue('1.25'),
    sortino: metricValue('1.9'),
    winRate: metricValue('0.55'),
    profitFactor: metricValue('1.4'),
    exposure: metricValue('0.38'),
    maxDrawdownAtClose: { depth: '0.052', durationCandles: 120 },
    trades: 20,
    wins: 11,
    losses: 9,
    feesPaid: '85.30',
    netProfit: '420.00',
    ...overrides,
  };
}

export function buildRun(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'run-1',
    strategyVersionId: 'version-1',
    kind: 'backtest',
    status: 'completed',
    symbol: 'BTCUSDT',
    timeframe: '1h',
    runParameters: { initialBalance: '10000', feeRate: '0.001', slippageRate: '0.0005' },
    periodStart: START,
    periodEnd: END,
    progress: 100,
    metrics: buildMetrics(),
    overfitting: null,
    errorCode: null,
    createdAt: '2026-10-10T12:00:00.000Z',
    startedAt: '2026-10-10T12:00:01.000Z',
    finishedAt: '2026-10-10T12:00:05.000Z',
    warnings: [],
    queuePosition: null,
    survival: null,
    waitingForData: null,
    ...overrides,
  };
}

export function buildEquityCsv(count: number): string {
  const rows = Array.from({ length: count }, (_, index) => {
    const equity = (10_000 + (index * 420) / (count - 1)).toFixed(2);
    const benchmark = (10_000 + (index * 110) / (count - 1)).toFixed(2);
    return `${START + index * 3_600_000},${equity},${equity},${benchmark}`;
  });
  return ['candle_time,equity,equity_at_low,benchmark', ...rows].join('\n');
}

export function buildStrategy(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'strategy-1',
    name: 'Placar clássico',
    isExample: false,
    createdAt: '2026-10-01T10:00:00.000Z',
    updatedAt: '2026-10-05T10:00:00.000Z',
    ...overrides,
  };
}

export const CLASSIC_CONFIG = {
  schemaVersion: 1,
  rules: [
    { id: 'ema-9-21', kind: 'ema_cross', fastPeriod: 9, slowPeriod: 21 },
    { id: 'rsi-14', kind: 'rsi', period: 14, oversold: 30, overbought: 70 },
  ],
  regime: {
    kind: 'adx',
    period: 14,
    trendThreshold: 25,
    weights: {
      trending: { trend: '1.5', reversion: '0.5', volume: '1', sentiment: '1' },
      ranging: { trend: '0.5', reversion: '1.5', volume: '1', sentiment: '1' },
    },
  },
  thresholds: { buy: '2', sell: '-2' },
  entry: { orderType: 'market' },
  risk: {
    atrPeriod: 14,
    stopAtrMultiple: '2',
    targetAtrMultiple: '3',
    riskPerTrade: '0.01',
    maxExposureRate: '1',
  },
};

export function buildVersion(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'version-1',
    strategyId: 'strategy-1',
    version: 1,
    config: CLASSIC_CONFIG,
    configHash: 'a'.repeat(64),
    createdAt: '2026-10-01T10:00:00.000Z',
    ...overrides,
  };
}
