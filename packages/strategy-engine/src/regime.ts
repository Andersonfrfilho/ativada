// Copyright (c) 2026 Ada Technology. All rights reserved.
import { REGIME_ADX_INDICATOR_ID } from './engine.constant.js';
import { EngineDecimal, decimalFromIndicator } from './engine-decimal.js';
import {
  REGIME,
  REGIME_FILTER_KIND,
  type Regime,
  type StrategyFamily,
} from './engine-vocabulary.constant.js';
import { readIndicatorOutput } from './indicator-reading.js';
import type { IndicatorValue } from './indicator.types.js';
import type { RegimeConfig } from './strategy-config.types.js';

// Sem filtro de regime todas as famílias pesam 1.
const NO_REGIME_WEIGHT = '1';
const ADX_DISPLAY_DECIMAL_PLACES = 1;

export type ResolveRegimeParams = {
  readonly regime: RegimeConfig;
  readonly adx: IndicatorValue | undefined;
};

export type ResolvedRegime = {
  readonly regime: Regime;
  readonly adx: number | null;
};

export type ResolveFamilyWeightParams = {
  readonly regimeConfig: RegimeConfig;
  readonly regime: Regime;
  readonly family: StrategyFamily;
};

// ADX do fechamento corrente ≥ limiar ⇒ tendência; senão, lateral. `none` ⇒ sem filtro.
export function resolveRegime(params: ResolveRegimeParams): ResolvedRegime {
  const { regime } = params;
  if (regime.kind !== REGIME_FILTER_KIND.ADX) return { regime: REGIME.NONE, adx: null };
  const adx = readIndicatorOutput({
    value: params.adx,
    output: 'adx',
    indicatorId: REGIME_ADX_INDICATOR_ID,
  });
  return { regime: adx >= regime.trendThreshold ? REGIME.TRENDING : REGIME.RANGING, adx };
}

export function resolveFamilyWeight(params: ResolveFamilyWeightParams): string {
  const { regimeConfig, regime, family } = params;
  if (regimeConfig.kind !== REGIME_FILTER_KIND.ADX || regime === REGIME.NONE) {
    return NO_REGIME_WEIGHT;
  }
  const weights =
    regime === REGIME.TRENDING ? regimeConfig.weights.trending : regimeConfig.weights.ranging;
  return weights[family];
}

// Truncado, nunca arredondado para cima: ADX 24,96 não pode virar "25.0" e contradizer o regime lateral.
export function formatTruncatedAdx(adx: number): string {
  return decimalFromIndicator(adx)
    .toDecimalPlaces(ADX_DISPLAY_DECIMAL_PLACES, EngineDecimal.ROUND_DOWN)
    .toFixed(ADX_DISPLAY_DECIMAL_PLACES);
}
