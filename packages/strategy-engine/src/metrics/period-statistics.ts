// Copyright (c) 2026 Ada Technology. All rights reserved.
import { EngineDecimal, type EngineDecimalValue } from '../engine-decimal.js';
import type { MetricsPoint } from './metrics-input.js';

const ZERO = new EngineDecimal(0);
const ONE = new EngineDecimal(1);

// r_k = E_k ÷ E_{k−1} − 1: fechamento a fechamento.
export function computePeriodReturns(points: readonly MetricsPoint[]): EngineDecimalValue[] {
  return points.slice(1).map((point, index) => {
    const previous = points[index];
    return previous === undefined ? ZERO : point.equity.dividedBy(previous.equity).minus(ONE);
  });
}

export function computeMean(values: readonly EngineDecimalValue[]): EngineDecimalValue {
  return values.reduce((sum, value) => sum.plus(value), ZERO).dividedBy(values.length);
}

// Divisão decimal é arredondada corretamente: razões iguais dão valores IGUAIS, então "sem variação" é exato.
function areAllEqual(values: readonly EngineDecimalValue[]): boolean {
  const [first] = values;
  return first === undefined || values.every((value) => value.equals(first));
}

// Desvio amostral: n − 1 no denominador.
export function computeSampleDeviation(
  values: readonly EngineDecimalValue[],
  mean: EngineDecimalValue,
): EngineDecimalValue {
  if (areAllEqual(values)) return ZERO;
  const squares = values.reduce((sum, value) => sum.plus(value.minus(mean).pow(2)), ZERO);
  return squares.dividedBy(values.length - 1).sqrt();
}

// Alvo mínimo 0, sobre TODOS os períodos: o positivo entra como 0, nunca é descartado.
export function computeDownsideDeviation(
  values: readonly EngineDecimalValue[],
): EngineDecimalValue {
  const squares = values.reduce(
    (sum, value) => sum.plus(EngineDecimal.min(value, ZERO).pow(2)),
    ZERO,
  );
  return squares.dividedBy(values.length).sqrt();
}
