// Copyright (c) 2026 Ada Technology. All rights reserved.
import { computeEmaConvergenceCandles } from './compute-indicator-series.js';
import { defineIndicator } from './define-indicator.js';
import { assertIndicatorPeriod } from './indicator-input.js';
import { INDICATOR_NAME } from './indicator-name.constant.js';
import type { PeriodParams } from './indicator-params.types.js';
import {
  advanceSmoother,
  exponentialWeight,
  INITIAL_SMOOTHER_STATE,
  parseSmootherState,
  type SmootherState,
} from './indicator-smoothing.js';

// EMA com α = 2/(n+1), semeada pela média simples das `n` primeiras (ADR 0002).
export const EMA_INDICATOR = defineIndicator<PeriodParams, SmootherState, number>({
  name: INDICATOR_NAME.EMA,
  horizon: ({ period }) => {
    assertIndicatorPeriod(period, INDICATOR_NAME.EMA);
    return { warmupCandles: period, convergenceCandles: computeEmaConvergenceCandles(period) };
  },
  initialState: () => INITIAL_SMOOTHER_STATE,
  parseState: ({ params, snapshot }) => parseSmootherState(snapshot, params.period),
  advance: ({ params, state, candle }) => {
    const next = advanceSmoother({
      state,
      input: candle.close,
      period: params.period,
      weight: exponentialWeight(params.period),
    });
    return { state: next, value: next.value ?? undefined };
  },
});
