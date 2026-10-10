// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { EngineCandle } from './engine-candle.types.js';
import { LEAD_IN_WARMUP_MULTIPLIER } from './engine.constant.js';
import type { IndicatorCandle, IndicatorDefinition, IndicatorValue } from './indicator.types.js';

export type ComputeIndicatorSeriesParams<TParams, TValue extends IndicatorValue> = {
  readonly definition: IndicatorDefinition<TParams, TValue>;
  readonly params: TParams;
  readonly candles: readonly IndicatorCandle[];
};

export function toIndicatorCandle(candle: EngineCandle): IndicatorCandle {
  return {
    high: Number(candle.high),
    low: Number(candle.low),
    close: Number(candle.close),
    volume: Number(candle.volume),
  };
}

// O lote é o mesmo laço de `update` do ao vivo: não existe implementação vetorizada paralela.
export function computeIndicatorSeries<TParams, TValue extends IndicatorValue>(
  params: ComputeIndicatorSeriesParams<TParams, TValue>,
): readonly (TValue | undefined)[] {
  const indicator = params.definition.create(params.params);
  return params.candles.map((candle) => indicator.update(candle));
}

export function computeLeadInCandles(longestWarmupCandles: number): number {
  return Math.max(1, longestWarmupCandles) * LEAD_IN_WARMUP_MULTIPLIER;
}
