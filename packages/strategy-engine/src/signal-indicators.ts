// Copyright (c) 2026 Ada Technology. All rights reserved.
import { ruleIndicatorId } from './compute-indicator-series.js';
import { REGIME_FILTER_KIND, RULE_KIND } from './engine-vocabulary.constant.js';
import {
  INDICATOR_NAMESPACE,
  REGIME_ADX_INDICATOR_ID,
  RISK_ATR_INDICATOR_ID,
} from './engine.constant.js';
import {
  createRuleIndicator,
  INDICATOR_REGISTRY,
  isCandleRule,
  restoreRuleIndicator,
  type CandleRule,
  type IndicatorBinding,
} from './indicator-registry.js';
import { readNumber, readRecord } from './indicator-snapshot.js';
import type { IndicatorCandle, IndicatorValue } from './indicator.types.js';
import type { JsonValue } from './json-value.types.js';
import type { RuleReading, ScoreboardReadings } from './rule-reading.types.js';
import type { StrategyConfig } from './strategy-config.types.js';

export type IndicatorSnapshots = Readonly<Record<string, JsonValue>>;

export type AdvanceIndicatorsParams = {
  readonly config: StrategyConfig;
  readonly snapshots: IndicatorSnapshots;
  readonly candle: IndicatorCandle;
};

export type AdvancedIndicators = {
  readonly readings: ScoreboardReadings;
  readonly snapshots: IndicatorSnapshots;
};

type AdvanceContext = {
  readonly snapshots: IndicatorSnapshots;
  readonly candle: IndicatorCandle;
  readonly next: Record<string, JsonValue>;
};

// O valor do candle anterior de um rompimento de Donchian vive no estado, ao lado do snapshot.
export function previousValueId(indicatorId: string): string {
  return `${INDICATOR_NAMESPACE.PREVIOUS}:${indicatorId}`;
}

function readStoredValue(stored: JsonValue | undefined): IndicatorValue | undefined {
  if (stored === undefined) return undefined;
  const record = readRecord(stored);
  return Object.fromEntries(Object.keys(record).map((key) => [key, readNumber(record, key)]));
}

function advanceRule(rule: CandleRule, context: AdvanceContext): RuleReading {
  const { snapshots, candle, next } = context;
  const id = ruleIndicatorId(rule.id);
  const stored = snapshots[id];
  const indicator =
    stored === undefined
      ? createRuleIndicator(rule)
      : restoreRuleIndicator({ rule, snapshot: stored });
  const current = indicator.update(candle);
  next[id] = indicator.snapshot();
  if (rule.kind !== RULE_KIND.DONCHIAN_BREAKOUT) return { current, previous: undefined };
  const previousId = previousValueId(id);
  if (current !== undefined) next[previousId] = current;
  return { current, previous: readStoredValue(snapshots[previousId]) };
}

function advanceBound<TConfig>(params: {
  readonly binding: IndicatorBinding<TConfig>;
  readonly config: TConfig;
  readonly id: string;
  readonly context: AdvanceContext;
}): IndicatorValue | undefined {
  const { binding, config, id, context } = params;
  const stored = context.snapshots[id];
  const indicator =
    stored === undefined ? binding.create(config) : binding.restore({ config, snapshot: stored });
  const value = indicator.update(context.candle);
  context.next[id] = indicator.snapshot();
  return value;
}

// Restaura cada indicador do snapshot do estado (ou cria, no primeiro candle), atualiza com o candle
// fechado e fotografa de novo: o estado de volta é JSON puro e a ordem das chaves é a da configuração.
export function advanceIndicators(params: AdvanceIndicatorsParams): AdvancedIndicators {
  const { config } = params;
  const context: AdvanceContext = { snapshots: params.snapshots, candle: params.candle, next: {} };
  const rules: Record<string, RuleReading> = {};
  for (const rule of config.rules.filter(isCandleRule)) rules[rule.id] = advanceRule(rule, context);
  const atr = advanceBound({
    binding: INDICATOR_REGISTRY.risk,
    config: config.risk,
    id: RISK_ATR_INDICATOR_ID,
    context,
  });
  const adx =
    config.regime.kind === REGIME_FILTER_KIND.ADX
      ? advanceBound({
          binding: INDICATOR_REGISTRY.regime,
          config: config.regime,
          id: REGIME_ADX_INDICATOR_ID,
          context,
        })
      : undefined;
  return { readings: { rules, atr, adx }, snapshots: context.next };
}
