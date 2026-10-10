// Copyright (c) 2026 Ada Technology. All rights reserved.
import {
  type OracleCandle,
  type OracleNumber,
  type OracleSeries,
  OracleDecimal,
  single,
  SMOOTHING_KIND,
  smoothSeries,
  ZERO,
} from './oracle-decimal.fixture.js';
import { closesOf, type PeriodParams } from './oracle-trend.fixture.js';

const PERCENT = new OracleDecimal(100);
const NEUTRAL_RSI = new OracleDecimal(50);

function wilderOf(
  inputs: readonly (OracleNumber | undefined)[],
  period: number,
): (OracleNumber | undefined)[] {
  return smoothSeries({ inputs, period, kind: SMOOTHING_KIND.WILDER });
}

// 100·G/(G+L); sem ganho e sem perda (platô) é neutro, 50 (ADR 0002, bordas).
function relativeStrengthIndex(averageGain: OracleNumber, averageLoss: OracleNumber): OracleNumber {
  const total = averageGain.plus(averageLoss);
  return total.isZero() ? NEUTRAL_RSI : PERCENT.times(averageGain).dividedBy(total);
}

export function computeRsiOracle(
  candles: readonly OracleCandle[],
  params: PeriodParams,
): OracleSeries {
  const closes = closesOf(candles);
  const changes = closes.map((close, index) =>
    index === 0 ? undefined : close.minus(closes[index - 1] ?? close),
  );
  const gains = changes.map((change) =>
    change === undefined ? undefined : OracleDecimal.max(change, ZERO),
  );
  const losses = changes.map((change) =>
    change === undefined ? undefined : OracleDecimal.max(change.negated(), ZERO),
  );
  const averageGains = wilderOf(gains, params.period);
  const averageLosses = wilderOf(losses, params.period);
  return closes.map((_close, index) => {
    const averageGain = averageGains[index];
    const averageLoss = averageLosses[index];
    if (averageGain === undefined || averageLoss === undefined) return undefined;
    return single(relativeStrengthIndex(averageGain, averageLoss));
  });
}

export function trueRangesOf(candles: readonly OracleCandle[]): OracleNumber[] {
  return candles.map((candle, index) => {
    const rangeOfCandle = candle.high.minus(candle.low);
    const previous = candles[index - 1];
    if (previous === undefined) return rangeOfCandle;
    return OracleDecimal.max(
      rangeOfCandle,
      candle.high.minus(previous.close).abs(),
      candle.low.minus(previous.close).abs(),
    );
  });
}

export function computeAtrOracle(
  candles: readonly OracleCandle[],
  params: PeriodParams,
): OracleSeries {
  const averages = wilderOf(trueRangesOf(candles), params.period);
  return averages.map((value) => (value === undefined ? undefined : single(value)));
}

type DirectionalMovement = { readonly plus: OracleNumber; readonly minus: OracleNumber };

// Wilder estrito: só o lado maior pontua e só se positivo; no 1º candle (sem anterior) ambos valem 0.
function directionalMovementsOf(candles: readonly OracleCandle[]): DirectionalMovement[] {
  return candles.map((candle, index) => {
    const previous = candles[index - 1];
    if (previous === undefined) return { plus: ZERO, minus: ZERO };
    const up = candle.high.minus(previous.high);
    const down = previous.low.minus(candle.low);
    return {
      plus: up.greaterThan(down) && up.greaterThan(0) ? up : ZERO,
      minus: down.greaterThan(up) && down.greaterThan(0) ? down : ZERO,
    };
  });
}

function directionalIndex(plusIndicator: OracleNumber, minusIndicator: OracleNumber): OracleNumber {
  const total = plusIndicator.plus(minusIndicator);
  if (total.isZero()) return ZERO;
  return PERCENT.times(plusIndicator.minus(minusIndicator).abs()).dividedBy(total);
}

function indicatorOf(smoothedMovement: OracleNumber, smoothedRange: OracleNumber): OracleNumber {
  return smoothedRange.isZero() ? ZERO : PERCENT.times(smoothedMovement).dividedBy(smoothedRange);
}

export function computeAdxOracle(
  candles: readonly OracleCandle[],
  params: PeriodParams,
): OracleSeries {
  const movements = directionalMovementsOf(candles);
  const ranges = wilderOf(trueRangesOf(candles), params.period);
  const plusMoves = wilderOf(
    movements.map((movement) => movement.plus),
    params.period,
  );
  const minusMoves = wilderOf(
    movements.map((movement) => movement.minus),
    params.period,
  );
  const indicators = candles.map((_candle, index) => {
    const range = ranges[index];
    const plusMove = plusMoves[index];
    const minusMove = minusMoves[index];
    if (range === undefined || plusMove === undefined || minusMove === undefined) return undefined;
    return { plusDi: indicatorOf(plusMove, range), minusDi: indicatorOf(minusMove, range) };
  });
  const directional = indicators.map((entry) =>
    entry === undefined ? undefined : directionalIndex(entry.plusDi, entry.minusDi),
  );
  const adx = wilderOf(directional, params.period);
  return candles.map((_candle, index) => {
    const entry = indicators[index];
    const adxValue = adx[index];
    if (entry === undefined || adxValue === undefined) return undefined;
    return { adx: adxValue, plusDi: entry.plusDi, minusDi: entry.minusDi };
  });
}
