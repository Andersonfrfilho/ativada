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

type RsiState = {
  readonly previousClose: number | null;
  readonly gains: SmootherState;
  readonly losses: SmootherState;
};

const MAXIMUM_RSI = 100;
const NEUTRAL_RSI = 50;

// 100·G/(G+L): sem perdas dá 100, sem ganhos 0; sem ganhos e sem perdas (platô) é neutro, 50.
function relativeStrengthIndex(averageGain: number, averageLoss: number): number {
  const total = averageGain + averageLoss;
  return total === 0 ? NEUTRAL_RSI : (MAXIMUM_RSI * averageGain) / total;
}

// RSI de Wilder: médias de ganho e perda suavizadas (semente: média simples das `n` primeiras variações).
export const RSI_INDICATOR = defineIndicator<PeriodParams, RsiState, number>({
  name: INDICATOR_NAME.RSI,
  horizon: ({ period }) => {
    assertIndicatorPeriod(period, INDICATOR_NAME.RSI);
    return {
      warmupCandles: period + 1,
      convergenceCandles: computeWilderConvergenceCandles(period),
    };
  },
  initialState: () => ({
    previousClose: null,
    gains: INITIAL_SMOOTHER_STATE,
    losses: INITIAL_SMOOTHER_STATE,
  }),
  parseState: ({ params, snapshot }) => {
    const record = readRecord(snapshot);
    return {
      previousClose: readNullableNumber(record, PREVIOUS_CLOSE_KEY),
      gains: parseSmootherState(record.gains, params.period),
      losses: parseSmootherState(record.losses, params.period),
    };
  },
  advance: ({ params, state, candle }) => {
    if (state.previousClose === null) {
      return { state: { ...state, previousClose: candle.close }, value: undefined };
    }
    const change = candle.close - state.previousClose;
    const weight = wilderWeight(params.period);
    const period = params.period;
    const gains = advanceSmoother({
      state: state.gains,
      input: Math.max(change, 0),
      period,
      weight,
    });
    const losses = advanceSmoother({
      state: state.losses,
      input: Math.max(-change, 0),
      period,
      weight,
    });
    const hasValue = gains.value !== null && losses.value !== null;
    return {
      state: { previousClose: candle.close, gains, losses },
      value: hasValue ? relativeStrengthIndex(gains.value, losses.value) : undefined,
    };
  },
});
