// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, test } from 'bun:test';

import {
  computeEmaConvergenceCandles,
  computeLeadInCandles,
  computeWilderConvergenceCandles,
  flattenIndicatorValue,
  REGIME_ADX_INDICATOR_ID,
  RISK_ATR_INDICATOR_ID,
  ruleIndicatorId,
  toIndicatorCandle,
} from '../packages/strategy-engine/src/index.js';
import {
  buildCandles,
  LIMIT_SCENARIO_PRICES,
  openTimeAt,
} from './fixtures/strategy-engine/engine-scenarios.fixture.js';
import {
  createSimpleAverageDefinition,
  expectIndicatorContract,
  SIMPLE_AVERAGE_DEFECT,
} from './fixtures/strategy-engine/indicator-contract.fixture.js';

const CANDLES = buildCandles(LIMIT_SCENARIO_PRICES).map(toIndicatorCandle);

describe('indicator contract harness', () => {
  test('a correct incremental indicator passes', () => {
    expectIndicatorContract({
      definition: createSimpleAverageDefinition(),
      params: { period: 4 },
      candles: CANDLES,
    });
  });

  test.each([
    [SIMPLE_AVERAGE_DEFECT.WRONG_WARMUP, /aquecimento/],
    [SIMPLE_AVERAGE_DEFECT.LOSSY_SNAPSHOT, /Retomada do snapshot/],
    [SIMPLE_AVERAGE_DEFECT.SHORT_CONVERGENCE, /Convergência/],
  ] as const)('the harness fails the indicator whose defect is %s', (defect, expectedReason) => {
    expect(() =>
      expectIndicatorContract({
        definition: createSimpleAverageDefinition(defect),
        params: { period: 4 },
        candles: CANDLES,
      }),
    ).toThrow(expectedReason);
  });

  test('candle prices cross to numbers only for indicators, with open and open time for the VWAP', () => {
    expect(CANDLES[3]).toStrictEqual({
      openTime: openTimeAt(3),
      open: 100,
      high: 101,
      low: 99.5,
      close: 100,
      volume: 100000,
    });
  });
});

describe('lead-in by convergence (ε = 1e-3)', () => {
  test('EMA converges in (n+1)/2·ln(1/ε) candles and Wilder in n·ln(1/ε)', () => {
    expect(computeEmaConvergenceCandles(9)).toBe(35);
    expect(computeEmaConvergenceCandles(26)).toBe(94);
    expect(computeWilderConvergenceCandles(14)).toBe(97);
  });

  test('the lead-in is the longest warmup or convergence of every indicator used', () => {
    const horizons = [
      { warmupCandles: 21, convergenceCandles: computeEmaConvergenceCandles(21) },
      { warmupCandles: 34, convergenceCandles: computeEmaConvergenceCandles(26) },
      { warmupCandles: 15, convergenceCandles: computeWilderConvergenceCandles(14) },
      { warmupCandles: 28, convergenceCandles: computeWilderConvergenceCandles(14) },
    ];
    expect(computeLeadInCandles(horizons)).toBe(97);
    expect(computeLeadInCandles([{ warmupCandles: 20, convergenceCandles: 20 }])).toBe(20);
    expect(computeLeadInCandles([])).toBe(1);
  });
});

describe('indicator ids', () => {
  test('snapshot and value ids carry a namespace and multi-output values are flattened', () => {
    expect([
      ruleIndicatorId('macd-12-26-9'),
      RISK_ATR_INDICATOR_ID,
      REGIME_ADX_INDICATOR_ID,
    ]).toStrictEqual(['rule:macd-12-26-9', 'risk:atr', 'regime:adx']);
    expect(
      flattenIndicatorValue('rule:macd-12-26-9', { signal: 1.5, macd: 2, histogram: 0.5 }),
    ).toStrictEqual({
      'rule:macd-12-26-9.histogram': 0.5,
      'rule:macd-12-26-9.macd': 2,
      'rule:macd-12-26-9.signal': 1.5,
    });
    expect(flattenIndicatorValue(RISK_ATR_INDICATOR_ID, 3.2)).toStrictEqual({ 'risk:atr': 3.2 });
    expect(flattenIndicatorValue(RISK_ATR_INDICATOR_ID, undefined)).toStrictEqual({
      'risk:atr': null,
    });
  });
});
