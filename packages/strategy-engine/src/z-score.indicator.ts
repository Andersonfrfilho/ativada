// Copyright (c) 2026 Ada Technology. All rights reserved.
import { defineIndicator } from './define-indicator.js';
import { assertIndicatorPeriod } from './indicator-input.js';
import { INDICATOR_NAME } from './indicator-name.constant.js';
import type { PeriodParams } from './indicator-params.types.js';
import { slideWindow, windowStatistics } from './indicator-statistics.js';
import { EMPTY_WINDOW_STATE, parseWindowState, type WindowState } from './indicator-window.js';

// z-score do fechamento na janela de `period` (inclui o corrente), com o desvio POPULACIONAL do
// Bollinger; desvio zero dá z-score 0.
export const Z_SCORE_INDICATOR = defineIndicator<PeriodParams, WindowState, number>({
  name: INDICATOR_NAME.Z_SCORE,
  horizon: ({ period }) => {
    assertIndicatorPeriod(period, INDICATOR_NAME.Z_SCORE);
    return { warmupCandles: period, convergenceCandles: period };
  },
  initialState: () => EMPTY_WINDOW_STATE,
  parseState: ({ params, snapshot }) => parseWindowState({ snapshot, period: params.period }),
  advance: ({ params, state, candle }) => {
    const window = slideWindow({ window: state.window, value: candle.close, size: params.period });
    if (window.length < params.period) return { state: { window }, value: undefined };
    const { mean, deviation } = windowStatistics(window);
    return {
      state: { window },
      value: deviation === 0 ? 0 : (candle.close - mean) / deviation,
    };
  },
});
