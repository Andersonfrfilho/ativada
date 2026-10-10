// Copyright (c) 2026 Ada Technology. All rights reserved.
import { defineIndicator } from './define-indicator.js';
import { assertIndicatorPeriod } from './indicator-input.js';
import { INDICATOR_NAME } from './indicator-name.constant.js';
import type { PeriodParams } from './indicator-params.types.js';
import { readNumberArray, readRecord } from './indicator-snapshot.js';
import { slideWindow } from './indicator-statistics.js';

type DonchianState = {
  readonly highs: readonly number[];
  readonly lows: readonly number[];
};

type DonchianValue = { readonly lower: number; readonly upper: number };

function maximumOf(values: readonly number[]): number {
  return values.reduce((best, value) => Math.max(best, value), Number.NEGATIVE_INFINITY);
}

function minimumOf(values: readonly number[]): number {
  return values.reduce((best, value) => Math.min(best, value), Number.POSITIVE_INFINITY);
}

// Maior máxima e menor mínima dos últimos `period` candles, incluindo o corrente.
export const DONCHIAN_INDICATOR = defineIndicator<PeriodParams, DonchianState, DonchianValue>({
  name: INDICATOR_NAME.DONCHIAN,
  horizon: ({ period }) => {
    assertIndicatorPeriod(period, INDICATOR_NAME.DONCHIAN);
    return { warmupCandles: period, convergenceCandles: period };
  },
  initialState: () => ({ highs: [], lows: [] }),
  parseState: ({ params, snapshot }) => {
    const record = readRecord(snapshot);
    const maximumLength = params.period;
    return {
      highs: readNumberArray({ record, key: 'highs', maximumLength }),
      lows: readNumberArray({ record, key: 'lows', maximumLength }),
    };
  },
  advance: ({ params, state, candle }) => {
    const size = params.period;
    const highs = slideWindow({ window: state.highs, value: candle.high, size });
    const lows = slideWindow({ window: state.lows, value: candle.low, size });
    const isFull = highs.length === size;
    return {
      state: { highs, lows },
      value: isFull ? { lower: minimumOf(lows), upper: maximumOf(highs) } : undefined,
    };
  },
});
