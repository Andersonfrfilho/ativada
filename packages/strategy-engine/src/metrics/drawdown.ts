// Copyright (c) 2026 Ada Technology. All rights reserved.
import { EngineDecimal, type EngineDecimalValue } from '../engine-decimal.js';
import { StrategyEngineError } from '../strategy-engine.error.js';
import { formatMetric } from './metric-value.js';
import type { MetricsPoint } from './metrics-input.js';
import type { DrawdownMetric, DrawdownMetrics } from './metrics.types.js';

const ZERO = new EngineDecimal(0);

const NO_DRAWDOWN: DrawdownMetric = {
  depth: '0',
  peakTime: null,
  troughTime: null,
  recoveryTime: null,
  durationCandles: 0,
  durationMilliseconds: 0,
};

type Candidate = {
  readonly depth: EngineDecimalValue;
  readonly peakIndex: number;
  readonly peakValue: EngineDecimalValue;
  readonly troughIndex: number;
};

type ValleyOf = (point: MetricsPoint) => EngineDecimalValue;

// Pico = máximo corrente do FECHAMENTO (inclusive o candle corrente: o lado pior). O pico passa a ser o último
// ponto que o alcançou, de modo que uma volta exata ao pico encerra a queda anterior. Só a profundidade
// ESTRITAMENTE maior substitui: no empate vale a ocorrência mais antiga.
function findDeepestDrawdown(
  points: readonly MetricsPoint[],
  valleyOf: ValleyOf,
): Candidate | null {
  let deepest: Candidate | null = null;
  let peakValue = ZERO;
  let peakIndex = 0;
  points.forEach((point, index) => {
    if (point.equity.greaterThanOrEqualTo(peakValue)) {
      peakValue = point.equity;
      peakIndex = index;
    }
    const depth = peakValue.minus(valleyOf(point)).dividedBy(peakValue);
    if (depth.greaterThan(deepest?.depth ?? ZERO)) {
      deepest = { depth, peakIndex, peakValue, troughIndex: index };
    }
  });
  return deepest;
}

function timeOf(points: readonly MetricsPoint[], index: number): number {
  const point = points[index];
  if (point === undefined) throw new StrategyEngineError('Índice de ponto fora da série.');
  return point.time;
}

// Recuperação: o primeiro ponto, a partir do vale (inclusive), cujo fechamento volta ao pico.
function describeDrawdown(
  points: readonly MetricsPoint[],
  candidate: Candidate | null,
): DrawdownMetric {
  if (candidate === null) return NO_DRAWDOWN;
  const offset = points
    .slice(candidate.troughIndex)
    .findIndex((point) => point.equity.greaterThanOrEqualTo(candidate.peakValue));
  const recoveryIndex = offset === -1 ? null : candidate.troughIndex + offset;
  const endIndex = recoveryIndex ?? points.length - 1;
  const peakTime = timeOf(points, candidate.peakIndex);
  return {
    depth: formatMetric(candidate.depth),
    peakTime,
    troughTime: timeOf(points, candidate.troughIndex),
    recoveryTime: recoveryIndex === null ? null : timeOf(points, recoveryIndex),
    durationCandles: endIndex - candidate.peakIndex,
    durationMilliseconds: timeOf(points, endIndex) - peakTime,
  };
}

function measure(points: readonly MetricsPoint[], valleyOf: ValleyOf): DrawdownMetric {
  return describeDrawdown(points, findDeepestDrawdown(points, valleyOf));
}

// `maxDrawdownAtLow` é o relatório honesto e o das metas: mede o vale na mínima do candle.
export function computeDrawdowns(params: {
  readonly points: readonly MetricsPoint[];
}): DrawdownMetrics {
  return {
    maxDrawdownAtClose: measure(params.points, (point) => point.equity),
    maxDrawdownAtLow: measure(params.points, (point) => point.low),
  };
}
