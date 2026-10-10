// Copyright (c) 2026 Ada Technology. All rights reserved.
import { computeLeadInCandles } from './compute-indicator-series.js';
import { createInitialSignalState } from './engine-state.js';
import type { SignalState } from './engine-state.types.js';
import { REGIME_FILTER_KIND, RULE_KIND } from './engine-vocabulary.constant.js';
import {
  createRuleIndicator,
  INDICATOR_REGISTRY,
  isCandleRule,
  type CandleRule,
} from './indicator-registry.js';
import type { IndicatorHorizon } from './indicator.types.js';
import type { StrategyConfig } from './strategy-config.types.js';

// O rompimento de Donchian compara com o canal do candle ANTERIOR: pede um candle a mais.
const BREAKOUT_EXTRA_CANDLES = 1;

function ruleHorizon(rule: CandleRule): IndicatorHorizon {
  const indicator = createRuleIndicator(rule);
  const extra = rule.kind === RULE_KIND.DONCHIAN_BREAKOUT ? BREAKOUT_EXTRA_CANDLES : 0;
  return {
    warmupCandles: indicator.warmupCandles + extra,
    convergenceCandles: indicator.convergenceCandles + extra,
  };
}

// Horizonte de TODO indicador que o sinal usa: regras, ATR do risco e ADX do regime.
export function collectIndicatorHorizons(config: StrategyConfig): readonly IndicatorHorizon[] {
  const risk = INDICATOR_REGISTRY.risk.create(config.risk);
  const regime =
    config.regime.kind === REGIME_FILTER_KIND.ADX
      ? [INDICATOR_REGISTRY.regime.create(config.regime)]
      : [];
  return [...config.rules.filter(isCandleRule).map(ruleHorizon), risk, ...regime];
}

export function computeStrategyLeadInCandles(config: StrategyConfig): number {
  return computeLeadInCandles(collectIndicatorHorizons(config));
}

export function createStrategySignalState(config: StrategyConfig): SignalState {
  return createInitialSignalState(computeStrategyLeadInCandles(config));
}
