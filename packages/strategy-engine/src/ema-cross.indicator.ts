// Copyright (c) 2026 Ada Technology. All rights reserved.
import { computeEmaConvergenceCandles } from './compute-indicator-series.js';
import { defineIndicator } from './define-indicator.js';
import { assertIndicatorPeriod, refuseIndicator } from './indicator-input.js';
import { INDICATOR_NAME } from './indicator-name.constant.js';
import type { EmaCrossParams } from './indicator-params.types.js';
import { readRecord } from './indicator-snapshot.js';
import {
  advanceSmoother,
  exponentialWeight,
  INITIAL_SMOOTHER_STATE,
  parseSmootherState,
  type SmootherState,
} from './indicator-smoothing.js';
import { INDICATOR_ERROR_CODE } from './strategy-engine.error.js';

type EmaCrossState = {
  readonly fast: SmootherState;
  readonly slow: SmootherState;
};

type EmaCrossValue = { readonly fast: number; readonly slow: number };

function exponentialStep(params: {
  readonly state: SmootherState;
  readonly input: number;
  readonly period: number;
}): SmootherState {
  return advanceSmoother({ ...params, weight: exponentialWeight(params.period) });
}

// Composto da regra `ema_cross`: a EMA rápida e a lenta do fechamento; sai quando a lenta sai.
export const EMA_CROSS_INDICATOR = defineIndicator<EmaCrossParams, EmaCrossState, EmaCrossValue>({
  name: INDICATOR_NAME.EMA_CROSS,
  horizon: ({ fastPeriod, slowPeriod }) => {
    assertIndicatorPeriod(fastPeriod, INDICATOR_NAME.EMA_CROSS);
    assertIndicatorPeriod(slowPeriod, INDICATOR_NAME.EMA_CROSS);
    if (fastPeriod >= slowPeriod) {
      refuseIndicator(INDICATOR_ERROR_CODE.INVALID_PARAMETER, 'ema-cross exige fast < slow.');
    }
    return {
      warmupCandles: slowPeriod,
      convergenceCandles: computeEmaConvergenceCandles(slowPeriod),
    };
  },
  initialState: () => ({ fast: INITIAL_SMOOTHER_STATE, slow: INITIAL_SMOOTHER_STATE }),
  parseState: ({ params, snapshot }) => {
    const record = readRecord(snapshot);
    return {
      fast: parseSmootherState(record.fast, params.fastPeriod),
      slow: parseSmootherState(record.slow, params.slowPeriod),
    };
  },
  advance: ({ params, state, candle }) => {
    const fast = exponentialStep({
      state: state.fast,
      input: candle.close,
      period: params.fastPeriod,
    });
    const slow = exponentialStep({
      state: state.slow,
      input: candle.close,
      period: params.slowPeriod,
    });
    const hasValue = fast.value !== null && slow.value !== null;
    return {
      state: { fast, slow },
      value: hasValue ? { fast: fast.value, slow: slow.value } : undefined,
    };
  },
});
