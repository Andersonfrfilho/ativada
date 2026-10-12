// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { WalkForwardRequest } from '../../apps/api-ativada/src/walk-forward/walk-forward.types.js';
import type { EngineCandle } from '../../packages/strategy-engine/src/index.js';
import { buildDailyCandles } from '../../test/fixtures/walk-forward/daily-candles.fixture.js';
import { SHORT_STRATEGY } from '../../test/fixtures/walk-forward/walk-forward-scenarios.fixture.js';
import {
  PERIOD_END,
  PERIOD_START,
  SERIES_FIRST_OPEN_TIME,
  TWO_YEARS_OF_HOURLY_CANDLES,
} from './walkforward-test.constant.js';
import type { Scenario } from './walkforward-test-context.js';

export const STRATEGY_CONFIG = SHORT_STRATEGY;

// 24 combinações: 4 períodos rápidos × 3 lentos × 2 limiares de compra.
export const GRID_24 = {
  parameters: [
    { path: 'rules.ema-cross.fastPeriod', values: [3, 5, 8, 12] },
    { path: 'rules.ema-cross.slowPeriod', values: [20, 30, 50] },
    { path: 'thresholds.buy', values: ['1', '1.5'] },
  ],
} as const;

// 200 combinações: 10 × 5 × 4.
export const GRID_200 = {
  parameters: [
    { path: 'rules.ema-cross.fastPeriod', values: [3, 4, 5, 6, 7, 8, 9, 10, 12, 15] },
    { path: 'rules.ema-cross.slowPeriod', values: [20, 25, 30, 40, 50] },
    { path: 'thresholds.buy', values: ['1', '1.25', '1.5', '1.75'] },
  ],
} as const;

export type SeriesKind = {
  readonly symbol: string;
  readonly seed: number;
  readonly driftBasisPoints: number;
};

export function buildHourlySeries(kind: SeriesKind): EngineCandle[] {
  return buildDailyCandles({
    count: TWO_YEARS_OF_HOURLY_CANDLES,
    seed: kind.seed,
    firstOpenTime: SERIES_FIRST_OPEN_TIME,
    timeframe: '1h',
    symbol: kind.symbol,
    driftBasisPoints: kind.driftBasisPoints,
    volatilityBasisPoints: 55,
  });
}

export function hourlyScenario(params: {
  readonly versionId: string;
  readonly symbol: string;
  readonly request: WalkForwardRequest;
  readonly costs?: Scenario['costs'];
}): Scenario {
  return {
    versionId: params.versionId,
    symbol: params.symbol,
    timeframe: '1h',
    periodStart: PERIOD_START,
    periodEnd: PERIOD_END,
    request: params.request,
    ...(params.costs === undefined ? {} : { costs: params.costs }),
  };
}

export const NO_COSTS = { feeRate: '0', slippageRate: '0' } as const;
