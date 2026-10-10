// Copyright (c) 2026 Ada Technology. All rights reserved.
import { defineIndicator } from './define-indicator.js';
import { assertIndicatorPeriod, refuseIndicator } from './indicator-input.js';
import { INDICATOR_NAME } from './indicator-name.constant.js';
import type { BollingerParams } from './indicator-params.types.js';
import { slideWindow, windowStatistics } from './indicator-statistics.js';
import { EMPTY_WINDOW_STATE, parseWindowState, type WindowState } from './indicator-window.js';
import { INDICATOR_ERROR_CODE } from './strategy-engine.error.js';

type BollingerValue = {
  readonly lower: number;
  readonly middle: number;
  readonly upper: number;
  readonly width: number;
};

function buildBands(params: {
  readonly window: readonly number[];
  readonly deviations: number;
}): BollingerValue {
  const { mean, deviation } = windowStatistics(params.window);
  const distance = deviation * params.deviations;
  const upper = mean + distance;
  const lower = mean - distance;
  return { lower, middle: mean, upper, width: mean === 0 ? 0 : (upper - lower) / mean };
}

// Bandas de Bollinger: média ± k × desvio populacional dos últimos `period` fechamentos.
export const BOLLINGER_INDICATOR = defineIndicator<BollingerParams, WindowState, BollingerValue>({
  name: INDICATOR_NAME.BOLLINGER,
  horizon: ({ period, deviations }) => {
    assertIndicatorPeriod(period, INDICATOR_NAME.BOLLINGER);
    if (!Number.isFinite(deviations) || deviations <= 0) {
      refuseIndicator(
        INDICATOR_ERROR_CODE.INVALID_PARAMETER,
        'Desvios do Bollinger precisam ser > 0.',
      );
    }
    return { warmupCandles: period, convergenceCandles: period };
  },
  initialState: () => EMPTY_WINDOW_STATE,
  parseState: ({ params, snapshot }) => parseWindowState({ snapshot, period: params.period }),
  advance: ({ params, state, candle }) => {
    const window = slideWindow({ window: state.window, value: candle.close, size: params.period });
    const isFull = window.length === params.period;
    return {
      state: { window },
      value: isFull ? buildBands({ window, deviations: params.deviations }) : undefined,
    };
  },
});
