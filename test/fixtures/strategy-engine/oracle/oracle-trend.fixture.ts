// Copyright (c) 2026 Ada Technology. All rights reserved.
import {
  averageOf,
  OracleDecimal,
  type OracleCandle,
  type OracleNumber,
  type OracleSeries,
  single,
  SMOOTHING_KIND,
  smoothSeries,
  windowAt,
} from './oracle-decimal.fixture.js';

export type PeriodParams = { readonly period: number };
export type MacdParams = {
  readonly fastPeriod: number;
  readonly slowPeriod: number;
  readonly signalPeriod: number;
};

export function closesOf(candles: readonly OracleCandle[]): OracleNumber[] {
  return candles.map((candle) => candle.close);
}

export function computeSmaOracle(
  candles: readonly OracleCandle[],
  params: PeriodParams,
): OracleSeries {
  const closes = closesOf(candles);
  return closes.map((_close, index) =>
    index < params.period - 1
      ? undefined
      : single(averageOf(windowAt(closes, index, params.period))),
  );
}

export function computeEmaOracle(
  candles: readonly OracleCandle[],
  params: PeriodParams,
): OracleSeries {
  const smoothed = smoothSeries({
    inputs: closesOf(candles),
    period: params.period,
    kind: SMOOTHING_KIND.EXPONENTIAL,
  });
  return smoothed.map((value) => (value === undefined ? undefined : single(value)));
}

export function computeMacdOracle(
  candles: readonly OracleCandle[],
  params: MacdParams,
): OracleSeries {
  const closes = closesOf(candles);
  const emaOf = (
    period: number,
    inputs: readonly (OracleNumber | undefined)[],
  ): (OracleNumber | undefined)[] =>
    smoothSeries({ inputs, period, kind: SMOOTHING_KIND.EXPONENTIAL });
  const fast = emaOf(params.fastPeriod, closes);
  const slow = emaOf(params.slowPeriod, closes);
  const macdLine = closes.map((_close, index) => {
    const fastValue = fast[index];
    const slowValue = slow[index];
    return fastValue === undefined || slowValue === undefined
      ? undefined
      : fastValue.minus(slowValue);
  });
  const signal = emaOf(params.signalPeriod, macdLine);
  return closes.map((_close, index) => {
    const macd = macdLine[index];
    const signalValue = signal[index];
    if (macd === undefined || signalValue === undefined) return undefined;
    return { macd, signal: signalValue, histogram: macd.minus(signalValue) };
  });
}

export function computeDonchianOracle(
  candles: readonly OracleCandle[],
  params: PeriodParams,
): OracleSeries {
  return candles.map((_candle, index) => {
    if (index < params.period - 1) return undefined;
    const window = windowAt(candles, index, params.period);
    return {
      upper: OracleDecimal.max(...window.map((candle) => candle.high)),
      lower: OracleDecimal.min(...window.map((candle) => candle.low)),
    };
  });
}
