// Copyright (c) 2026 Ada Technology. All rights reserved.
export function buildGoal(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'goal-1',
    symbol: 'BTCUSDT',
    targetRate: '0.03',
    horizonDays: 30,
    maxLossRate: '0.05',
    isActive: true,
    createdAt: '2026-10-01T10:00:00.000Z',
    updatedAt: '2026-10-01T10:00:00.000Z',
    ...overrides,
  };
}

function rule(overrides: Record<string, unknown>): Record<string, unknown> {
  return {
    ruleId: 'rsi-14',
    kind: 'rsi',
    family: 'reversion',
    vote: 0,
    weight: '1',
    isMet: false,
    metric: 'rsi',
    direction: 'below',
    basis: 'exact',
    current: '48.2',
    threshold: '30',
    distance: '18.2',
    distanceRate: null,
    ...overrides,
  };
}

export function buildSituation(): Record<string, unknown> {
  return {
    signal: {
      action: 'HOLD',
      score: '0.5',
      regime: 'ranging',
      reason: 'Neutro: placar entre os limiares',
    },
    triggers: {
      version: 'trigger-1',
      state: 'awaiting_entry',
      action: 'HOLD',
      score: '0.5',
      scoreThreshold: '2',
      scoreGap: '1.5',
      rules: [
        rule({}),
        rule({
          ruleId: 'ema-9-21',
          kind: 'ema_cross',
          family: 'trend',
          metric: 'close_price',
          direction: 'above',
          current: '61000',
          threshold: '61500',
          distance: '500',
          distanceRate: '0.0082',
          basis: 'indicative',
        }),
      ],
    },
  };
}

export function buildCombination(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    rank: 1,
    strategy: { id: 'strategy-1', name: 'Placar clássico', versionId: 'version-1', version: 1 },
    symbol: 'BTCUSDT',
    isGoalSymbol: true,
    candlesUsed: 430,
    lastCandleOpenTime: 1_767_225_600_000,
    evaluation: {
      version: 'goal-1',
      goal: { targetRate: '0.03', maxLossRate: '0.05', horizonDays: 30 },
      horizonCandles: 30,
      levels: { target: '10300', stop: '9500' },
      windowCount: 200,
      firstWindowOpenTime: 1_700_000_000_000,
      lastWindowOpenTime: 1_760_000_000_000,
      reachedCount: 110,
      stoppedCount: 30,
      expiredCount: 60,
      reachRate: '0.55',
      stopRate: '0.15',
      expiredRate: '0.3',
      medianCandlesToTarget: '9',
      medianDaysToTarget: '9',
      netReturn: { mean: '0.02', median: '0.025' },
      benchmark: { reachedCount: 80, stoppedCount: 50, reachRate: '0.4', stopRate: '0.25' },
      verdict: 'COMPRAR',
    },
    situation: buildSituation(),
    ...overrides,
  };
}

export function buildEvaluation(combinations: Record<string, unknown>[]): Record<string, unknown> {
  return {
    goal: buildGoal(),
    timeframe: '1d',
    evaluatedStrategies: 2,
    isStrategyListTruncated: false,
    combinations,
    unavailable: [
      { strategyId: 'strategy-1', symbol: 'ETHUSDT', reason: 'CANDLES_NOT_CONTIGUOUS' },
    ],
  };
}
