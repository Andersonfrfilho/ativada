// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { EngineCandle } from './engine-candle.types.js';
import { INDICATOR_NAMESPACE, LN_INVERSE_CONVERGENCE_EPSILON } from './engine.constant.js';
import type {
  IndicatorCandle,
  IndicatorDefinition,
  IndicatorHorizon,
  IndicatorValue,
} from './indicator.types.js';

export type ComputeIndicatorSeriesParams<TParams, TValue extends IndicatorValue> = {
  readonly definition: IndicatorDefinition<TParams, TValue>;
  readonly params: TParams;
  readonly candles: readonly IndicatorCandle[];
};

export function toIndicatorCandle(candle: EngineCandle): IndicatorCandle {
  return {
    openTime: candle.openTime,
    open: Number(candle.open),
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

// Média exponencial com α = 2/(n+1): peso residual (1−α)^k ≈ e^(−2k/(n+1)) < ε ⇒ k ≈ (n+1)/2·ln(1/ε).
export function computeEmaConvergenceCandles(period: number): number {
  return Math.ceil(((period + 1) / 2) * LN_INVERSE_CONVERGENCE_EPSILON);
}

// Suavização de Wilder (α = 1/n; ATR, ADX, RSI): (1−1/n)^k ≈ e^(−k/n) < ε ⇒ k ≈ n·ln(1/ε).
export function computeWilderConvergenceCandles(period: number): number {
  return Math.ceil(period * LN_INVERSE_CONVERGENCE_EPSILON);
}

// Pré-aquecimento = o maior entre aquecimento e convergência de TODOS os indicadores usados
// (regras, ATR do risco e ADX do regime). Mudar a fórmula é nova `engineVersion`.
export function computeLeadInCandles(horizons: readonly IndicatorHorizon[]): number {
  return horizons.reduce(
    (longest, horizon) => Math.max(longest, horizon.warmupCandles, horizon.convergenceCandles),
    1,
  );
}

export function ruleIndicatorId(ruleId: string): string {
  return `${INDICATOR_NAMESPACE.RULE}:${ruleId}`;
}

// Valor de várias saídas vira chaves `<id>.<saída>` (ordem alfabética) no registro do sinal.
export function flattenIndicatorValue(
  indicatorId: string,
  value: IndicatorValue | undefined,
): Readonly<Record<string, number | null>> {
  if (value === undefined) return { [indicatorId]: null };
  if (typeof value === 'number') return { [indicatorId]: value };
  const outputs = Object.keys(value).sort((left, right) => (left < right ? -1 : 1));
  return Object.fromEntries(
    outputs.map((output) => [`${indicatorId}.${output}`, value[output] ?? null]),
  );
}
