// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, test } from 'bun:test';

import {
  computeLeadInCandles,
  LEAD_IN_WARMUP_MULTIPLIER,
  toIndicatorCandle,
} from '../packages/strategy-engine/src/index.js';
import {
  buildCandles,
  LIMIT_SCENARIO_PRICES,
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
  ] as const)('the harness fails the indicator whose defect is %s', (defect, expectedReason) => {
    expect(() =>
      expectIndicatorContract({
        definition: createSimpleAverageDefinition(defect),
        params: { period: 4 },
        candles: CANDLES,
      }),
    ).toThrow(expectedReason);
  });

  test('candle prices cross to numbers only for indicators', () => {
    expect(CANDLES[9]).toStrictEqual({ high: 101, low: 99.5, close: 100, volume: 10 });
  });

  test('the lead-in is three times the longest warmup', () => {
    expect(LEAD_IN_WARMUP_MULTIPLIER).toBe(3);
    expect(computeLeadInCandles(34)).toBe(102);
    expect(computeLeadInCandles(0)).toBe(3);
  });
});
