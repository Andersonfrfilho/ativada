// Copyright (c) 2026 Ada Technology. All rights reserved.
import { EngineDecimal, type EngineDecimalValue } from '../engine-decimal.js';
import { formatMetric } from '../metrics/metric-value.js';
import type { MetricValue } from '../metrics/metrics.types.js';
import {
  MIN_ELIGIBLE_WINDOW_FRACTION,
  OVERFITTING_DEGRADATION_LIMIT,
  OVERFITTING_REASON,
  OVERFITTING_UNDEFINED_REASON,
  WALK_FORWARD_ERROR_CODE,
  type OverfittingReason,
} from './walk-forward.constant.js';
import { WalkForwardError } from './walk-forward.error.js';
import type {
  OverfittingAlert,
  OverfittingValue,
  OverfittingWindow,
} from './walk-forward.types.js';

export type DetectOverfittingParams = {
  readonly windows: readonly OverfittingWindow[];
  readonly outOfSampleSharpe: MetricValue;
};

const ZERO = new EngineDecimal(0);

function defined(value: EngineDecimalValue): OverfittingValue {
  return { value: formatMetric(value), reason: null };
}

type UndefinedReason = Exclude<OverfittingValue['reason'], null>;

function undefinedValue(reason: UndefinedReason): OverfittingValue {
  return { value: null, reason };
}

// Média do Sharpe do ajuste ponderada pela quantidade de pontos do ajuste, só das janelas elegíveis.
function weightedInSampleSharpe(windows: readonly OverfittingWindow[]): OverfittingValue {
  const usable = windows.filter((window) => window.isEligible && window.inSampleSharpe !== null);
  if (usable.some((window) => !(window.weight > 0))) {
    throw new WalkForwardError({
      code: WALK_FORWARD_ERROR_CODE.INVALID_SELECTION_INPUT,
      message: 'O peso de uma janela é um número positivo.',
    });
  }
  const totalWeight = usable.reduce((sum, window) => sum + window.weight, 0);
  if (totalWeight === 0) return undefinedValue(OVERFITTING_UNDEFINED_REASON.NO_ELIGIBLE_WINDOWS);
  const weighted = usable.reduce(
    (sum, window) => sum.plus(new EngineDecimal(window.inSampleSharpe ?? '0').times(window.weight)),
    ZERO,
  );
  return defined(weighted.dividedBy(totalWeight));
}

function computeDegradation(
  inSample: OverfittingValue,
  outOfSample: MetricValue,
): OverfittingValue {
  if (inSample.value === null) return undefinedValue(inSample.reason);
  if (outOfSample.value === null) {
    return undefinedValue(OVERFITTING_UNDEFINED_REASON.UNDEFINED_OUT_OF_SAMPLE);
  }
  const base = new EngineDecimal(inSample.value);
  if (!base.greaterThan(ZERO))
    return undefinedValue(OVERFITTING_UNDEFINED_REASON.NON_POSITIVE_IN_SAMPLE);
  return defined(new EngineDecimal(outOfSample.value).dividedBy(base));
}

function collectReasons(params: {
  readonly inSample: OverfittingValue;
  readonly outOfSample: MetricValue;
  readonly eligibleWindows: number;
  readonly totalWindows: number;
}): OverfittingReason[] {
  const reasons: OverfittingReason[] = [];
  const { inSample, outOfSample } = params;
  const hasPositiveGain =
    inSample.value !== null && new EngineDecimal(inSample.value).greaterThan(ZERO);
  if (hasPositiveGain && outOfSample.value === null) {
    reasons.push(OVERFITTING_REASON.OUT_OF_SAMPLE_UNDEFINED);
  }
  if (hasPositiveGain && inSample.value !== null && outOfSample.value !== null) {
    const out = new EngineDecimal(outOfSample.value);
    const limit = new EngineDecimal(inSample.value).times(OVERFITTING_DEGRADATION_LIMIT);
    if (out.lessThan(limit)) reasons.push(OVERFITTING_REASON.SHARPE_BELOW_HALF_OF_IN_SAMPLE);
    if (out.isNegative() && !out.isZero()) {
      reasons.push(OVERFITTING_REASON.NEGATIVE_OUT_OF_SAMPLE_WITH_POSITIVE_IN_SAMPLE);
    }
  }
  const minimum = new EngineDecimal(MIN_ELIGIBLE_WINDOW_FRACTION).times(params.totalWindows);
  if (params.totalWindows === 0 || new EngineDecimal(params.eligibleWindows).lessThan(minimum)) {
    reasons.push(OVERFITTING_REASON.TOO_FEW_ELIGIBLE_WINDOWS);
  }
  return reasons;
}

// O alerta de overfitting (plan.md §5): Sharpe fora da amostra abaixo de 50% do de dentro, fora da amostra
// negativo com dentro positivo, menos da metade das janelas com parâmetro elegível, ou fora da amostra
// indefinido quando o de dentro é positivo (não há como confirmar o ganho). Pura, em decimal exato.
export function detectOverfitting(params: DetectOverfittingParams): OverfittingAlert {
  const { windows, outOfSampleSharpe } = params;
  const inSampleSharpe = weightedInSampleSharpe(windows);
  const eligibleWindows = windows.filter((window) => window.isEligible).length;
  const reasons = collectReasons({
    inSample: inSampleSharpe,
    outOfSample: outOfSampleSharpe,
    eligibleWindows,
    totalWindows: windows.length,
  });
  return {
    isAlert: reasons.length > 0,
    reasons,
    inSampleSharpe,
    outOfSampleSharpe,
    degradation: computeDegradation(inSampleSharpe, outOfSampleSharpe),
    eligibleWindows,
    totalWindows: windows.length,
  };
}
