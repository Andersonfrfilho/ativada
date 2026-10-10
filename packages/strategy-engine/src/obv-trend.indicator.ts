// Copyright (c) 2026 Ada Technology. All rights reserved.
import { computeEmaConvergenceCandles } from './compute-indicator-series.js';
import { defineIndicator } from './define-indicator.js';
import { assertIndicatorPeriod } from './indicator-input.js';
import { INDICATOR_NAME } from './indicator-name.constant.js';
import type { ObvTrendParams } from './indicator-params.types.js';
import { readRecord } from './indicator-snapshot.js';
import {
  advanceSmoother,
  exponentialWeight,
  INITIAL_SMOOTHER_STATE,
  parseSmootherState,
  type SmootherState,
} from './indicator-smoothing.js';
import { advanceObv, INITIAL_OBV_STATE, parseObvState, type ObvState } from './obv.indicator.js';

type ObvTrendState = {
  readonly obv: ObvState;
  readonly ema: SmootherState;
};

type ObvTrendValue = { readonly ema: number; readonly obv: number };

// Composto da regra `obv_trend`: o OBV e a EMA do próprio OBV (semente: média dos `n` primeiros OBV).
export const OBV_TREND_INDICATOR = defineIndicator<ObvTrendParams, ObvTrendState, ObvTrendValue>({
  name: INDICATOR_NAME.OBV_TREND,
  horizon: ({ emaPeriod }) => {
    assertIndicatorPeriod(emaPeriod, INDICATOR_NAME.OBV_TREND);
    return {
      warmupCandles: emaPeriod,
      convergenceCandles: computeEmaConvergenceCandles(emaPeriod),
    };
  },
  initialState: () => ({ obv: INITIAL_OBV_STATE, ema: INITIAL_SMOOTHER_STATE }),
  parseState: ({ params, snapshot }) => {
    const record = readRecord(snapshot);
    return {
      obv: parseObvState(record.obv),
      ema: parseSmootherState(record.ema, params.emaPeriod),
    };
  },
  advance: ({ params, state, candle }) => {
    const obv = advanceObv({ state: state.obv, close: candle.close, volume: candle.volume });
    const ema = advanceSmoother({
      state: state.ema,
      input: obv.level,
      period: params.emaPeriod,
      weight: exponentialWeight(params.emaPeriod),
    });
    return {
      state: { obv, ema },
      value: ema.value === null ? undefined : { ema: ema.value, obv: obv.level },
    };
  },
});
