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
  ENGINE_VERSION,
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
  SIGNAL_ENGINE_VERSION,
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
export {
  missingIndicatorValue,
  readIndicatorOutput,
  readIndicatorScalar,
  type ReadIndicatorOutputParams,
} from './indicator-reading.js';
export type { JsonValue } from './json-value.types.js';
export {
  CLASSIC_SCOREBOARD_STRATEGY,
  type ExampleStrategy,
} from './classic-scoreboard.strategy.js';
export {
  createRunSetup,
  createStrategyVersion,
  hashRunParameters,
  hashStrategyConfig,
  parseRunParameters,
  parseStrategyConfig,
} from './parse-strategy-config.js';
export {
  formatTruncatedAdx,
  resolveFamilyWeight,
  resolveRegime,
  type ResolveFamilyWeightParams,
  type ResolveRegimeParams,
  type ResolvedRegime,
} from './regime.js';
export type { RuleReading, ScoreboardReadings } from './rule-reading.types.js';
export { RUN_PARAMETERS_SCHEMA } from './run-parameters.schema.js';
export { castRuleVote, type CastRuleVoteParams, type CastVote, type Vote } from './rule-vote.js';
export {
  resolveFreshSentiment,
  selectAvailableSentiment,
  type ResolveFreshSentimentParams,
  type SelectAvailableSentimentParams,
  type StoredSentimentObservation,
} from './sentiment.js';
export { ruleLabel } from './rule-label.js';
export { createEngine } from './create-engine.js';
export { computePositionSize } from './risk/position-size.js';
export { computeProtectivePrices } from './risk/protective-prices.js';
export * from './risk/risk.constant.js';
export type * from './risk/risk.types.js';
export { warnRunParameters } from './risk/run-parameter-warnings.js';
export {
  evaluateScoreboard,
  type ScoreboardEvaluation,
  type ScoreboardInput,
} from './scoreboard.js';
export {
  advanceIndicators,
  type AdvanceIndicatorsParams,
  type AdvancedIndicators,
  type IndicatorSnapshots,
} from './signal-indicators.js';
export {
  buildSignalReason,
  type BuildSignalReasonParams,
  type ReasonVote,
} from './signal-reason.js';
export { signalStep } from './signal-step.js';
export { simulatedFillModel } from './wallet/fill-model.js';
export { walletStep } from './wallet/wallet-step.js';
export { STRATEGY_CONFIG_SCHEMA } from './strategy-config.schema.js';
export { computeStrategyLeadInCandles, createStrategySignalState } from './strategy-horizons.js';
export type * from './strategy-config.types.js';
export * from './strategy-engine.error.js';
export { computeRunMetrics } from './metrics/compute-run-metrics.js';
export * from './metrics/metrics.constant.js';
export type * from './metrics/metrics.types.js';
export {
  computeOpenPositionMetrics,
  type ComputeOpenPositionMetricsParams,
} from './metrics/open-position-metrics.js';
export { reconcileRunMetrics } from './metrics/reconcile-run-metrics.js';
export * from './walk-forward/index.js';
export { computeBalanceSurvival } from './survival/compute-balance-survival.js';
export { parseSurvivalSettings } from './survival/survival-settings.schema.js';
export * from './survival/survival.constant.js';
export { SurvivalInputError } from './survival/survival.error.js';
export type * from './survival/survival.types.js';
