// Copyright (c) 2026 Ada Technology. All rights reserved.
export const SOURCE_EXCHANGE = 'binance';
export const WORK_DATABASE_PREFIX = 'crypto_wfreport_';
export const SOURCE_URL_VARIABLE = 'WALK_FORWARD_REPORT_SOURCE_URL';
export const WORK_URL_VARIABLE = 'WALK_FORWARD_REPORT_WORK_URL';

export const TRAIN_MONTHS = 6;
export const TEST_MONTHS = 2;
export const STEP_MONTHS = 2;
export const SEARCH_THREADS = 2;
export const NEIGHBOR_MIN_TRADES = 1;
export const DAY_MILLISECONDS = 86_400_000;

export const COSTS_WITH = { feeRate: '0.001', slippageRate: '0.0005' } as const;
export const COSTS_WITHOUT = { feeRate: '0', slippageRate: '0' } as const;

// Grade FECHADA do catálogo, centrada nos parâmetros de fábrica do Placar clássico (162 combinações, abaixo do teto de 200).
export const REPORT_GRID = {
  parameters: [
    { path: 'rules.ema-9-21.fastPeriod', values: [6, 9, 12] },
    { path: 'rules.ema-9-21.slowPeriod', values: [18, 21, 26] },
    { path: 'thresholds.buy', values: ['1.5', '2', '2.5'] },
    { path: 'risk.stopAtrMultiple', values: ['1.5', '2', '3'] },
    { path: 'risk.targetAtrMultiple', values: ['3', '4'] },
  ],
} as const;

export const FACTORY_ASSIGNMENT = {
  'rules.ema-9-21.fastPeriod': 9,
  'rules.ema-9-21.slowPeriod': 21,
  'thresholds.buy': '2',
  'risk.stopAtrMultiple': '2',
  'risk.targetAtrMultiple': '3',
} as const;

export const SCENARIOS = [
  { symbol: 'BTCUSDT', timeframe: '1h', minTradesPerWindow: 10 },
  { symbol: 'ETHUSDT', timeframe: '1d', minTradesPerWindow: 3 },
] as const;
