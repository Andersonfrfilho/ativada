// Copyright (c) 2026 Ada Technology. All rights reserved.
import {
  type OracleCandle,
  type OracleNumber,
  type OracleSeries,
  SINGLE_OUTPUT,
  SMOOTHING_KIND,
  smoothSeries,
} from './oracle-decimal.fixture.js';
import { computeEmaOracle } from './oracle-trend.fixture.js';
import { computeObvOracle } from './oracle-volume.fixture.js';

export type EmaCrossParams = { readonly fastPeriod: number; readonly slowPeriod: number };
export type ObvTrendParams = { readonly emaPeriod: number };

function outputOf(series: OracleSeries, index: number): OracleNumber | undefined {
  return series[index]?.[SINGLE_OUTPUT];
}

// Duas EMAs; sai quando a lenta sai (a rápida já saiu).
export function computeEmaCrossOracle(
  candles: readonly OracleCandle[],
  params: EmaCrossParams,
): OracleSeries {
  const fast = computeEmaOracle(candles, { period: params.fastPeriod });
  const slow = computeEmaOracle(candles, { period: params.slowPeriod });
  return candles.map((_candle, index) => {
    const fastValue = outputOf(fast, index);
    const slowValue = outputOf(slow, index);
    return fastValue === undefined || slowValue === undefined
      ? undefined
      : { fast: fastValue, slow: slowValue };
  });
}

// OBV e a EMA do próprio OBV (semente: SMA dos `emaPeriod` primeiros OBV, a partir do 1º candle).
export function computeObvTrendOracle(
  candles: readonly OracleCandle[],
  params: ObvTrendParams,
): OracleSeries {
  const obv = computeObvOracle(candles).map((value) => value?.[SINGLE_OUTPUT]);
  const ema = smoothSeries({
    inputs: obv,
    period: params.emaPeriod,
    kind: SMOOTHING_KIND.EXPONENTIAL,
  });
  return candles.map((_candle, index) => {
    const obvValue = obv[index];
    const emaValue = ema[index];
    return obvValue === undefined || emaValue === undefined
      ? undefined
      : { obv: obvValue, ema: emaValue };
  });
}
