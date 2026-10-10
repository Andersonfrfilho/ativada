// Copyright (c) 2026 Ada Technology. All rights reserved.

export const WORKSPACE_NAME = 'strategy-engine' as const;

export {
  assertCandleAfter,
  assertCandleSequence,
  assertCandleShape,
  type AssertCandleSequenceParams,
} from './assert-candle.js';
export {
  assertCommands,
  assertSentiment,
  assertSignalStepInput,
  assertStepInput,
  assertWalletStepInput,
  type AssertStepInputParams,
} from './assert-step-input.js';
export { canonicalJson } from './canonical-json.js';
export {
  computeEmaConvergenceCandles,
  computeIndicatorSeries,
  computeLeadInCandles,
  computeWilderConvergenceCandles,
  flattenIndicatorValue,
  ruleIndicatorId,
  toIndicatorCandle,
  type ComputeIndicatorSeriesParams,
} from './compute-indicator-series.js';
export {
  ENGINE_STATE_VERSION,
  ENGINE_TIMEFRAME,
  ENGINE_TIMEFRAME_DURATION_MILLISECONDS,
  INDICATOR_NAMESPACE,
  INDICATOR_SIGNIFICANT_DIGITS,
  LN_INVERSE_CONVERGENCE_EPSILON,
  MAX_INITIAL_BALANCE,
  MAX_STRATEGY_RULES,
  MAX_WALK_FORWARD_COMBINATIONS,
  MONEY_DECIMAL_PLACES,
  REGIME_ADX_INDICATOR_ID,
  RISK_ATR_INDICATOR_ID,
  RUN_PARAMETERS_SCHEMA_VERSION,
  SENTIMENT_STALE_AFTER_MILLISECONDS,
  STRATEGY_CONFIG_SCHEMA_VERSION,
  type EngineTimeframe,
} from './engine.constant.js';
export type { EngineCandle, SentimentObservation } from './engine-candle.types.js';
export {
  decimalFromIndicator,
  EngineDecimal,
  formatEngineDecimal,
  ROUNDING_DIRECTION,
  roundMoney,
  roundToIncrement,
  toEngineDecimal,
  type EngineDecimalValue,
  type RoundingDirection,
  type RoundToIncrementParams,
} from './engine-decimal.js';
export type * from './engine-decision.types.js';
export {
  createInitialEngineState,
  createInitialSignalState,
  createInitialWalletState,
  deserializeEngineState,
  serializeEngineState,
  validateEngineState,
  type CreateInitialEngineStateParams,
  type CreateInitialWalletStateParams,
} from './engine-state.js';
export type * from './engine-state.types.js';
export type * from './engine.types.js';
export * from './engine-vocabulary.constant.js';
export { ADX_INDICATOR } from './adx.indicator.js';
export { ATR_INDICATOR } from './atr.indicator.js';
export { BOLLINGER_INDICATOR } from './bollinger.indicator.js';
export { defineIndicator, type StatefulIndicatorSpec } from './define-indicator.js';
export { DONCHIAN_INDICATOR } from './donchian.indicator.js';
export { EMA_CROSS_INDICATOR } from './ema-cross.indicator.js';
export { EMA_INDICATOR } from './ema.indicator.js';
export { INDICATOR_NAME, type IndicatorName } from './indicator-name.constant.js';
export {
  createRuleIndicator,
  INDICATOR_REGISTRY,
  isCandleRule,
  restoreRuleIndicator,
  type AdxRegimeConfig,
  type CandleRule,
  type CandleRuleKind,
  type IndicatorBinding,
  type IndicatorRegistry,
  type RestoreRuleIndicatorParams,
} from './indicator-registry.js';
export type * from './indicator-params.types.js';
export type * from './indicator.types.js';
export { MACD_INDICATOR } from './macd.indicator.js';
export { OBV_INDICATOR } from './obv.indicator.js';
export { OBV_TREND_INDICATOR } from './obv-trend.indicator.js';
export { RSI_INDICATOR } from './rsi.indicator.js';
export { SMA_INDICATOR } from './sma.indicator.js';
export { VWAP_INDICATOR } from './vwap.indicator.js';
export { Z_SCORE_INDICATOR } from './z-score.indicator.js';
export type { JsonValue } from './json-value.types.js';
export {
  createRunSetup,
  createStrategyVersion,
  hashRunParameters,
  hashStrategyConfig,
  parseRunParameters,
  parseStrategyConfig,
} from './parse-strategy-config.js';
export { RUN_PARAMETERS_SCHEMA } from './run-parameters.schema.js';
export {
  resolveFreshSentiment,
  selectAvailableSentiment,
  type ResolveFreshSentimentParams,
  type SelectAvailableSentimentParams,
} from './sentiment.js';
export { STRATEGY_CONFIG_SCHEMA } from './strategy-config.schema.js';
export type * from './strategy-config.types.js';
export * from './strategy-engine.error.js';
