// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, test } from 'bun:test';

import {
  ENGINE_TIMEFRAME,
  HORIZON_DAYS,
  horizonCandlesOf,
} from '../packages/strategy-engine/src/index.js';

describe('horizonCandlesOf', () => {
  test('conta à mão: dias vezes candles por dia', () => {
    expect(horizonCandlesOf(7, ENGINE_TIMEFRAME.ONE_DAY)).toBe(7);
    expect(horizonCandlesOf(30, ENGINE_TIMEFRAME.ONE_DAY)).toBe(30);
    expect(horizonCandlesOf(7, ENGINE_TIMEFRAME.FIFTEEN_MINUTES)).toBe(672);
    expect(horizonCandlesOf(15, ENGINE_TIMEFRAME.FIFTEEN_MINUTES)).toBe(1_440);
    expect(horizonCandlesOf(30, ENGINE_TIMEFRAME.FIFTEEN_MINUTES)).toBe(2_880);
    expect(horizonCandlesOf(7, ENGINE_TIMEFRAME.ONE_HOUR)).toBe(168);
    expect(horizonCandlesOf(7, ENGINE_TIMEFRAME.FOUR_HOURS)).toBe(42);
  });

  test('os prazos do comparador dão número inteiro de candles em todo timeframe do motor', () => {
    for (const timeframe of Object.values(ENGINE_TIMEFRAME)) {
      for (const days of HORIZON_DAYS) {
        expect(Number.isInteger(horizonCandlesOf(days, timeframe))).toBe(true);
      }
    }
  });
});
