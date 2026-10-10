// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, test } from 'bun:test';

import {
  ATR_INDICATOR,
  BOLLINGER_INDICATOR,
  computeIndicatorSeries,
  DONCHIAN_INDICATOR,
  EMA_INDICATOR,
  OBV_INDICATOR,
  RSI_INDICATOR,
  SMA_INDICATOR,
  VWAP_INDICATOR,
  Z_SCORE_INDICATOR,
  type IndicatorDefinition,
  type IndicatorValue,
} from '../packages/strategy-engine/src/index.js';
import {
  HAND_CANDLES,
  HAND_EXPECTED,
  HAND_PERIOD,
} from './fixtures/strategy-engine/indicator-hand-values.fixture.js';
import { compareWithReference } from './fixtures/strategy-engine/oracle/oracle-comparison.fixture.js';

const HAND_TOLERANCE = 1e-14;
const HAND_DEVIATION_MULTIPLE = 2;

function expectHandValues<TParams, TValue extends IndicatorValue>(params: {
  readonly name: string;
  readonly definition: IndicatorDefinition<TParams, TValue>;
  readonly indicatorParams: TParams;
}): void {
  const actual = computeIndicatorSeries({
    definition: params.definition,
    params: params.indicatorParams,
    candles: HAND_CANDLES,
  });
  const comparison = compareWithReference({
    actual,
    expected: HAND_EXPECTED[params.name] ?? [],
  });
  expect(comparison.comparedCount).toBeGreaterThan(0);
  expect(comparison.maxError).toBeLessThan(HAND_TOLERANCE);
}

describe('values worked out on paper (6 candles, period 3, closes 10 11 12 14 13 12)', () => {
  test('SMA(3) = 11, 37/3, 13, 13', () => {
    expectHandValues({
      name: 'sma',
      definition: SMA_INDICATOR,
      indicatorParams: { period: HAND_PERIOD },
    });
  });

  test('EMA(3) seeded by the SMA: 11, 12.5, 12.75, 12.375', () => {
    expectHandValues({
      name: 'ema',
      definition: EMA_INDICATOR,
      indicatorParams: { period: HAND_PERIOD },
    });
  });

  test('RSI(3) = 100, 800/11, 1600/31', () => {
    expectHandValues({
      name: 'rsi',
      definition: RSI_INDICATOR,
      indicatorParams: { period: HAND_PERIOD },
    });
  });

  test('Donchian(3) = highest high and lowest low of the last 3 candles', () => {
    expectHandValues({
      name: 'donchian',
      definition: DONCHIAN_INDICATOR,
      indicatorParams: { period: HAND_PERIOD },
    });
  });

  test('Bollinger(3, 2) uses the population deviation', () => {
    expectHandValues({
      name: 'bollinger',
      definition: BOLLINGER_INDICATOR,
      indicatorParams: { period: HAND_PERIOD, deviations: HAND_DEVIATION_MULTIPLE },
    });
  });

  test('z-score(3) uses the population deviation: 1/√(2/3) and 5/√14', () => {
    expectHandValues({
      name: 'zScore',
      definition: Z_SCORE_INDICATOR,
      indicatorParams: { period: HAND_PERIOD },
    });
  });

  test('ATR(3): TR = 2, 3, 2, 3, 2, 2 seeded by 7/3, then 23/9, 64/27, 182/81', () => {
    expectHandValues({
      name: 'atr',
      definition: ATR_INDICATOR,
      indicatorParams: { period: HAND_PERIOD },
    });
  });

  test('OBV adds the volume when the close rises and subtracts it when it falls', () => {
    expectHandValues({ name: 'obv', definition: OBV_INDICATOR, indicatorParams: {} });
  });

  test('VWAP restarts at midnight UTC (candles 1-2 are day 1, candles 3-6 are day 2)', () => {
    expectHandValues({ name: 'vwap', definition: VWAP_INDICATOR, indicatorParams: {} });
  });
});
