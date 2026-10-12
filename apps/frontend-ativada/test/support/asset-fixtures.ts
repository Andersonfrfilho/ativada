// Copyright (c) 2026 Ada Technology. All rights reserved.
export function buildAssetItem(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    symbol: 'BTCUSDT',
    quantity: '0.5',
    averagePrice: '60000',
    price: { value: '62000', at: 1_760_000_000_000, source: '15m' },
    value: '31000',
    cost: '30000',
    result: '1000',
    resultRate: '0.03333333',
    targetPrice: '66000',
    stopPrice: '55200',
    isTargetReached: false,
    isStopReached: false,
    rule: {
      action: 'hold',
      situation: {
        signal: {
          action: 'BUY',
          score: '2',
          regime: 'trending',
          reason: 'Compra 4/4: todos os votos a favor',
        },
        triggers: { state: 'holding', scoreThreshold: '2', scoreGap: '0', rules: [] },
      },
    },
    ...overrides,
  };
}

export function buildSummary(
  items: readonly Record<string, unknown>[],
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    currency: 'USDT',
    targetRate: '0.1',
    stopRate: '0.08',
    strategy: { id: 'strategy-1', name: 'Placar clássico', versionId: 'version-1', version: 1 },
    items,
    totals: {
      value: '31000',
      cost: '30000',
      result: '1000',
      resultRate: '0.03333333',
      pricedAssets: items.length,
      unpricedAssets: 0,
    },
    ...overrides,
  };
}
