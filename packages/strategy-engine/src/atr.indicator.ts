// Copyright (c) 2026 Ada Technology. All rights reserved.
import { computeWilderConvergenceCandles } from './compute-indicator-series.js';
import { defineIndicator } from './define-indicator.js';
import { assertIndicatorPeriod } from './indicator-input.js';
import { INDICATOR_NAME } from './indicator-name.constant.js';
import type { PeriodParams } from './indicator-params.types.js';
import { PREVIOUS_CLOSE_KEY, readNullableNumber, readRecord } from './indicator-snapshot.js';
import {
  advanceSmoother,
  INITIAL_SMOOTHER_STATE,
  parseSmootherState,
  type SmootherState,
  wilderWeight,
} from './indicator-smoothing.js';
import { trueRangeOf } from './true-range.js';

type AtrState = {
  readonly previousClose: number | null;
  readonly ranges: SmootherState;
};

// ATR de Wilder: média suavizada do TR, semeada pela média simples dos `n` primeiros TR.
export const ATR_INDICATOR = defineIndicator<PeriodParams, AtrState, number>({
  name: INDICATOR_NAME.ATR,
  horizon: ({ period }) => {
    assertIndicatorPeriod(period, INDICATOR_NAME.ATR);
    return { warmupCandles: period, convergenceCandles: computeWilderConvergenceCandles(period) };
  },
  initialState: () => ({ previousClose: null, ranges: INITIAL_SMOOTHER_STATE }),
  parseState: ({ params, snapshot }) => {
    const record = readRecord(snapshot);
    return {
      previousClose: readNullableNumber(record, PREVIOUS_CLOSE_KEY),
      ranges: parseSmootherState(record.ranges, params.period),
    };
  },
  advance: ({ params, state, candle }) => {
    const ranges = advanceSmoother({
      state: state.ranges,
      input: trueRangeOf({
        high: candle.high,
        low: candle.low,
        previousClose: state.previousClose,
      }),
      period: params.period,
      weight: wilderWeight(params.period),
    });
    return { state: { previousClose: candle.close, ranges }, value: ranges.value ?? undefined };
  },
});
