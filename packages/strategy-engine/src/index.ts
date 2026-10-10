// Copyright (c) 2026 Ada Technology. All rights reserved.

export const WORKSPACE_NAME = 'strategy-engine' as const;

export { assertStepInput, type AssertStepInputParams } from './assert-step-input.js';
export { canonicalJson } from './canonical-json.js';
export {
  computeIndicatorSeries,
  computeLeadInCandles,
  toIndicatorCandle,
  type ComputeIndicatorSeriesParams,
} from './compute-indicator-series.js';
export {
  ENGINE_STATE_VERSION,
  ENGINE_TIMEFRAME,
  ENGINE_TIMEFRAME_DURATION_MILLISECONDS,
  INDICATOR_SIGNIFICANT_DIGITS,
  LEAD_IN_WARMUP_MULTIPLIER,
  MAX_STRATEGY_RULES,
  MAX_WALK_FORWARD_COMBINATIONS,
  MONEY_DECIMAL_PLACES,
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
  deserializeEngineState,
  serializeEngineState,
  validateEngineState,
  type CreateInitialEngineStateParams,
} from './engine-state.js';
export type * from './engine-state.types.js';
export type * from './engine.types.js';
export * from './engine-vocabulary.constant.js';
export type * from './indicator.types.js';
export type { JsonValue } from './json-value.types.js';
export {
  createStrategyVersion,
  hashStrategyConfig,
  parseStrategyConfig,
} from './parse-strategy-config.js';
export { STRATEGY_CONFIG_SCHEMA } from './strategy-config.schema.js';
export type * from './strategy-config.types.js';
export * from './strategy-engine.error.js';
