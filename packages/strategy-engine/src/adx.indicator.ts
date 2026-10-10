// Copyright (c) 2026 Ada Technology. All rights reserved.
import { computeWilderConvergenceCandles } from './compute-indicator-series.js';
import { defineIndicator } from './define-indicator.js';
import { assertIndicatorPeriod } from './indicator-input.js';
import { INDICATOR_NAME } from './indicator-name.constant.js';
import type { PeriodParams } from './indicator-params.types.js';
import { readNumber, readRecord } from './indicator-snapshot.js';
import {
  advanceWilder,
  INITIAL_SMOOTHER_STATE,
  parseSmootherState,
  type SmootherState,
} from './indicator-smoothing.js';
import type { JsonValue } from './json-value.types.js';
import { trueRangeOf } from './true-range.js';

type PreviousCandle = {
  readonly high: number;
  readonly low: number;
  readonly close: number;
};

type AdxState = {
  readonly previous: PreviousCandle | null;
  readonly ranges: SmootherState;
  readonly plusMoves: SmootherState;
  readonly minusMoves: SmootherState;
  readonly directionalIndexes: SmootherState;
};

type AdxValue = {
  readonly adx: number;
  readonly minusDi: number;
  readonly plusDi: number;
};

type DirectionalIndicators = { readonly plusDi: number; readonly minusDi: number };

const PERCENT = 100;

// Wilder estrito: só o lado maior pontua, e só se positivo (empate vale 0 para os dois). No primeiro
// candle, sem anterior, os dois valem 0 (mesma convenção da `trading-signals`).
function directionalMovement(params: {
  readonly candle: PreviousCandle;
  readonly previous: PreviousCandle | null;
}): { readonly plus: number; readonly minus: number } {
  const { candle, previous } = params;
  if (previous === null) return { plus: 0, minus: 0 };
  const up = candle.high - previous.high;
  const down = previous.low - candle.low;
  return { plus: up > down && up > 0 ? up : 0, minus: down > up && down > 0 ? down : 0 };
}

function indicatorOf(smoothedMovement: number, smoothedRange: number): number {
  return smoothedRange === 0 ? 0 : (PERCENT * smoothedMovement) / smoothedRange;
}

function directionalIndexOf(indicators: DirectionalIndicators): number {
  const total = indicators.plusDi + indicators.minusDi;
  return total === 0 ? 0 : (PERCENT * Math.abs(indicators.plusDi - indicators.minusDi)) / total;
}

type MovementStates = Pick<AdxState, 'ranges' | 'plusMoves' | 'minusMoves'>;

function smoothMovements(params: {
  readonly state: AdxState;
  readonly candle: PreviousCandle;
  readonly period: number;
}): MovementStates {
  const { state, candle, period } = params;
  const moves = directionalMovement({ candle, previous: state.previous });
  const range = trueRangeOf({
    high: candle.high,
    low: candle.low,
    previousClose: state.previous?.close ?? null,
  });
  return {
    ranges: advanceWilder({ state: state.ranges, input: range, period }),
    plusMoves: advanceWilder({ state: state.plusMoves, input: moves.plus, period }),
    minusMoves: advanceWilder({ state: state.minusMoves, input: moves.minus, period }),
  };
}

function indicatorsOf(states: MovementStates): DirectionalIndicators | null {
  const { ranges, plusMoves, minusMoves } = states;
  if (ranges.value === null || plusMoves.value === null || minusMoves.value === null) return null;
  return {
    plusDi: indicatorOf(plusMoves.value, ranges.value),
    minusDi: indicatorOf(minusMoves.value, ranges.value),
  };
}

function parsePreviousCandle(snapshot: JsonValue | undefined): PreviousCandle | null {
  if (snapshot === null) return null;
  const record = readRecord(snapshot);
  return {
    high: readNumber(record, 'high'),
    low: readNumber(record, 'low'),
    close: readNumber(record, 'close'),
  };
}

// ADX de Wilder: TR, +DM e −DM suavizados; DX = 100·|+DI − −DI|/(+DI + −DI); ADX = Wilder do DX (a
// segunda suavização). Primeiro valor no candle 2n − 1; convergência = soma das duas suavizações.
export const ADX_INDICATOR = defineIndicator<PeriodParams, AdxState, AdxValue>({
  name: INDICATOR_NAME.ADX,
  horizon: ({ period }) => {
    assertIndicatorPeriod(period, INDICATOR_NAME.ADX);
    return {
      warmupCandles: 2 * period - 1,
      convergenceCandles: 2 * computeWilderConvergenceCandles(period),
    };
  },
  initialState: () => ({
    previous: null,
    ranges: INITIAL_SMOOTHER_STATE,
    plusMoves: INITIAL_SMOOTHER_STATE,
    minusMoves: INITIAL_SMOOTHER_STATE,
    directionalIndexes: INITIAL_SMOOTHER_STATE,
  }),
  parseState: ({ params, snapshot }) => {
    const record = readRecord(snapshot);
    const { period } = params;
    return {
      previous: parsePreviousCandle(record.previous),
      ranges: parseSmootherState(record.ranges, period),
      plusMoves: parseSmootherState(record.plusMoves, period),
      minusMoves: parseSmootherState(record.minusMoves, period),
      directionalIndexes: parseSmootherState(record.directionalIndexes, period),
    };
  },
  advance: ({ params, state, candle }) => {
    const states = smoothMovements({ state, candle, period: params.period });
    const indicators = indicatorsOf(states);
    const directionalIndexes =
      indicators === null
        ? state.directionalIndexes
        : advanceWilder({
            state: state.directionalIndexes,
            input: directionalIndexOf(indicators),
            period: params.period,
          });
    const next: AdxState = {
      previous: { high: candle.high, low: candle.low, close: candle.close },
      ...states,
      directionalIndexes,
    };
    const adx = directionalIndexes.value;
    return {
      state: next,
      value: indicators === null || adx === null ? undefined : { adx, ...indicators },
    };
  },
});
