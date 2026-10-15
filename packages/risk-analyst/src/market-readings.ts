// Copyright (c) 2026 Ada Technology. All rights reserved.
import { EngineDecimal, formatEngineDecimal } from '@ativada/strategy-engine';

import { ANALYST_RULES, CANDLE_MILLISECONDS } from './analyst.constant.js';
import { decimalOf, divideDown, sumTexts } from './analyst-decimal.js';
import type { MarketReadings, ReadingCandle, RunCost, VoteReading } from './analyst.types.js';

// Índice da vela de abertura `openTime` numa lista crescente por abertura, ou -1.
export function locateCandle(
  candles: readonly { readonly openTime: number }[],
  openTime: number,
): number {
  let low = 0;
  let high = candles.length - 1;
  while (low <= high) {
    const middle = (low + high) >> 1;
    const found = candles[middle]?.openTime;
    if (found === undefined) return -1;
    if (found === openTime) return middle;
    if (found < openTime) low = middle + 1;
    else high = middle - 1;
  }
  return -1;
}

export type CandleLookupParams = {
  readonly candles: readonly ReadingCandle[];
  readonly candleTime: number;
};

// Volume da vela ÷ média das 96 anteriores (a vela `t` NÃO entra na média); `null` se falta vela na janela de 24 h.
// Soma zero dá '0' (mercado parado), nunca divisão por zero.
export function computeRelativeVolume(params: CandleLookupParams): string | null {
  const { candles, candleTime } = params;
  const average = ANALYST_RULES.volumeAverageCandles;
  const index = locateCandle(candles, candleTime);
  const current = candles[index];
  const first = candles[index - average];
  if (index < average || current === undefined || first === undefined) return null;
  if (first.openTime !== candleTime - average * CANDLE_MILLISECONDS) return null;
  const total = sumTexts(candles.slice(index - average, index).map((candle) => candle.volume));
  if (total.isZero()) return '0';
  return divideDown(decimalOf(current.volume).times(average), total);
}

export type MomentumParams = CandleLookupParams & { readonly lookbackCandles: number };

// (fechamento de `t` − fechamento de `t − k·d`) ÷ fechamento de `t − k·d`; só leitura exibida, não entra na regra.
export function computeMomentum(params: MomentumParams): string | null {
  const { candles, candleTime, lookbackCandles } = params;
  const current = candles[locateCandle(candles, candleTime)];
  const pastTime = candleTime - lookbackCandles * CANDLE_MILLISECONDS;
  const past = candles[locateCandle(candles, pastTime)];
  if (current === undefined || past === undefined) return null;
  const base = decimalOf(past.close);
  if (base.isZero()) return null;
  return divideDown(decimalOf(current.close).minus(base), base);
}

export function computeAtrRate(params: {
  readonly atr: string;
  readonly close: string;
}): string | null {
  const close = decimalOf(params.close);
  if (close.isZero()) return null;
  return divideDown(decimalOf(params.atr), close);
}

export type AtrRates = {
  // Os `atrRate` das velas com leitura em (t − 2.880·d, t], em ordem de abertura.
  readonly rates: readonly string[];
  readonly current: string | null;
};

export type CollectAtrRatesParams = {
  readonly series: readonly VoteReading[];
  readonly candleTime: number;
};

export function collectAtrRates(params: CollectAtrRatesParams): AtrRates {
  const { series, candleTime } = params;
  const windowStart = candleTime - ANALYST_RULES.percentileWindowCandles * CANDLE_MILLISECONDS;
  const rates: string[] = [];
  let current: string | null = null;
  for (const reading of series) {
    if (reading.openTime <= windowStart || reading.openTime > candleTime) continue;
    if (reading.atr === null) continue;
    const rate = computeAtrRate({ atr: reading.atr, close: reading.close });
    if (rate === null) continue;
    rates.push(rate);
    if (reading.openTime === candleTime) current = rate;
  }
  return { rates, current };
}

export type AtrPercentiles = { readonly p90: string | null; readonly p95: string | null };

// Percentil nearest-rank (posição ⌈p·N ÷ 100⌉, base 1, em ordem crescente); `null` abaixo de 96 amostras.
export function computeAtrPercentiles(rates: readonly string[]): AtrPercentiles {
  if (rates.length < ANALYST_RULES.percentileMinimumSamples) return { p90: null, p95: null };
  const sorted = rates.map(decimalOf).sort((left, right) => left.comparedTo(right));
  const pick = (percentile: number): string | null => {
    const value = sorted[Math.ceil((percentile * sorted.length) / 100) - 1];
    return value === undefined ? null : formatEngineDecimal(value);
  };
  return {
    p90: pick(ANALYST_RULES.confidentMaximumAtrPercentile),
    p95: pick(ANALYST_RULES.tooVolatileAtrPercentile),
  };
}

// 2 × (taxa + slippage) dos RunParameters, exato (a ida e a volta).
export function computeRoundTripCost(cost: RunCost): string {
  const perSide = new EngineDecimal(cost.feeRate).plus(cost.slippageRate);
  return formatEngineDecimal(perSide.times(2));
}

export function computeMoveToCost(params: {
  readonly atrRate: string | null;
  readonly roundTripCost: string;
}): string | null {
  const cost = decimalOf(params.roundTripCost);
  if (params.atrRate === null || cost.isZero()) return null;
  return divideDown(decimalOf(params.atrRate), cost);
}

export type ComputeMarketReadingsParams = CandleLookupParams & {
  readonly series: readonly VoteReading[];
  readonly runCost: RunCost;
};

export function computeMarketReadings(params: ComputeMarketReadingsParams): MarketReadings {
  const { candles, candleTime, series, runCost } = params;
  const { rates, current: atrRate } = collectAtrRates({ series, candleTime });
  const { p90, p95 } = computeAtrPercentiles(rates);
  const roundTripCost = computeRoundTripCost(runCost);
  return {
    relativeVolume: computeRelativeVolume({ candles, candleTime }),
    atrRate,
    atrPercentile90: p90,
    atrPercentile95: p95,
    momentumShort: computeMomentum({
      candles,
      candleTime,
      lookbackCandles: ANALYST_RULES.momentumShortCandles,
    }),
    momentumLong: computeMomentum({
      candles,
      candleTime,
      lookbackCandles: ANALYST_RULES.momentumLongCandles,
    }),
    roundTripCost,
    moveToCost: computeMoveToCost({ atrRate, roundTripCost }),
  };
}
