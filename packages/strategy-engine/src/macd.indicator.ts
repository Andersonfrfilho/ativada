// Copyright (c) 2026 Ada Technology. All rights reserved.
import { computeEmaConvergenceCandles } from './compute-indicator-series.js';
import { defineIndicator } from './define-indicator.js';
import { assertIndicatorPeriod, refuseIndicator } from './indicator-input.js';
import { INDICATOR_NAME } from './indicator-name.constant.js';
import type { MacdParams } from './indicator-params.types.js';
import { readRecord } from './indicator-snapshot.js';
import {
  advanceSmoother,
  exponentialWeight,
  INITIAL_SMOOTHER_STATE,
  parseSmootherState,
  type SmootherState,
} from './indicator-smoothing.js';
import { INDICATOR_ERROR_CODE } from './strategy-engine.error.js';

type MacdState = {
  readonly fast: SmootherState;
  readonly slow: SmootherState;
  readonly signal: SmootherState;
};

type MacdValue = {
  readonly histogram: number;
  readonly macd: number;
  readonly signal: number;
};

function exponentialStep(params: {
  readonly state: SmootherState;
  readonly input: number;
  readonly period: number;
}): SmootherState {
  return advanceSmoother({ ...params, weight: exponentialWeight(params.period) });
}

// MACD = EMA(rápida) − EMA(lenta); sinal = EMA do próprio MACD (semente: SMA dos primeiros valores).
export const MACD_INDICATOR = defineIndicator<MacdParams, MacdState, MacdValue>({
  name: INDICATOR_NAME.MACD,
  horizon: ({ fastPeriod, slowPeriod, signalPeriod }) => {
    [fastPeriod, slowPeriod, signalPeriod].forEach((period) =>
      assertIndicatorPeriod(period, INDICATOR_NAME.MACD),
    );
    if (fastPeriod >= slowPeriod) {
      refuseIndicator(INDICATOR_ERROR_CODE.INVALID_PARAMETER, 'MACD exige fast < slow.');
    }
    return {
      warmupCandles: slowPeriod + signalPeriod - 1,
      convergenceCandles:
        computeEmaConvergenceCandles(slowPeriod) + computeEmaConvergenceCandles(signalPeriod),
    };
  },
  initialState: () => ({
    fast: INITIAL_SMOOTHER_STATE,
    slow: INITIAL_SMOOTHER_STATE,
    signal: INITIAL_SMOOTHER_STATE,
  }),
  parseState: ({ params, snapshot }) => {
    const record = readRecord(snapshot);
    return {
      fast: parseSmootherState(record.fast, params.fastPeriod),
      slow: parseSmootherState(record.slow, params.slowPeriod),
      signal: parseSmootherState(record.signal, params.signalPeriod),
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
    const macd = fast.value !== null && slow.value !== null ? fast.value - slow.value : null;
    const signal =
      macd === null
        ? state.signal
        : exponentialStep({ state: state.signal, input: macd, period: params.signalPeriod });
    const hasValue = macd !== null && signal.value !== null;
    return {
      state: { fast, slow, signal },
      value: hasValue ? { histogram: macd - signal.value, macd, signal: signal.value } : undefined,
    };
  },
});
