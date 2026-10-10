// Copyright (c) 2026 Ada Technology. All rights reserved.
import {
  averageOf,
  type OracleCandle,
  type OracleNumber,
  type OracleSeries,
  populationDeviationOf,
  single,
  toOracleNumber,
  windowAt,
  ZERO,
} from './oracle-decimal.fixture.js';
import { closesOf, type PeriodParams } from './oracle-trend.fixture.js';

export type BollingerParams = { readonly period: number; readonly deviations: string };

export function computeBollingerOracle(
  candles: readonly OracleCandle[],
  params: BollingerParams,
): OracleSeries {
  const closes = closesOf(candles);
  const multiple = toOracleNumber(params.deviations);
  return closes.map((_close, index) => {
    if (index < params.period - 1) return undefined;
    const window = windowAt(closes, index, params.period);
    const middle = averageOf(window);
    const distance = populationDeviationOf(window).times(multiple);
    const upper = middle.plus(distance);
    const lower = middle.minus(distance);
    const width = middle.isZero() ? ZERO : upper.minus(lower).dividedBy(middle);
    return { lower, middle, upper, width };
  });
}

function zScoreOf(close: OracleNumber, window: readonly OracleNumber[]): OracleNumber {
  const deviation = populationDeviationOf(window);
  return deviation.isZero() ? ZERO : close.minus(averageOf(window)).dividedBy(deviation);
}

export function computeZScoreOracle(
  candles: readonly OracleCandle[],
  params: PeriodParams,
): OracleSeries {
  const closes = closesOf(candles);
  return closes.map((close, index) =>
    index < params.period - 1
      ? undefined
      : single(zScoreOf(close, windowAt(closes, index, params.period))),
  );
}
