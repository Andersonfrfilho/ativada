// Copyright (c) 2026 Ada Technology. All rights reserved.
import { defineIndicator } from './define-indicator.js';
import { assertIndicatorPeriod } from './indicator-input.js';
import { INDICATOR_NAME } from './indicator-name.constant.js';
import type { PeriodParams } from './indicator-params.types.js';
import { averageOf, slideWindow } from './indicator-statistics.js';
import { EMPTY_WINDOW_STATE, parseWindowState, type WindowState } from './indicator-window.js';

// Média dos últimos `period` fechamentos, recalculada a cada candle.
export const SMA_INDICATOR = defineIndicator<PeriodParams, WindowState, number>({
  name: INDICATOR_NAME.SMA,
  horizon: ({ period }) => {
    assertIndicatorPeriod(period, INDICATOR_NAME.SMA);
    return { warmupCandles: period, convergenceCandles: period };
  },
  initialState: () => EMPTY_WINDOW_STATE,
  parseState: ({ params, snapshot }) => parseWindowState({ snapshot, period: params.period }),
  advance: ({ params, state, candle }) => {
    const window = slideWindow({ window: state.window, value: candle.close, size: params.period });
    return {
      state: { window },
      value: window.length === params.period ? averageOf(window) : undefined,
    };
  },
});
