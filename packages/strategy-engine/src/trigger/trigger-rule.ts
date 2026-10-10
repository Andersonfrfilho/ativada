// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { SignalVote } from '../engine-decision.types.js';
import type { SentimentObservation } from '../engine-candle.types.js';
import { EngineDecimal, formatEngineDecimal, type EngineDecimalValue } from '../engine-decimal.js';
import { RULE_KIND } from '../engine-vocabulary.constant.js';
import type { RuleReading } from '../rule-reading.types.js';
import type { StrategyRule } from '../strategy-config.types.js';
import {
  TRIGGER_DECIMAL_PLACES,
  TRIGGER_DIRECTION,
  TRIGGER_METRIC,
  TRIGGER_STATE,
  type TriggerDirection,
  type TriggerState,
} from './trigger.constant.js';
import { measureChannel, measureEmaCross } from './trigger-measure-price.js';
import {
  measureFearGreed,
  measureMacd,
  measureObvTrend,
  measureRsi,
} from './trigger-measure-value.js';
import type { RuleTrigger, TriggerMeasure } from './trigger.types.js';

export type BuildRuleTriggerParams = {
  readonly rule: StrategyRule;
  readonly reading: RuleReading;
  readonly vote: SignalVote;
  readonly close: EngineDecimalValue;
  readonly sentiment: SentimentObservation | null;
  readonly state: TriggerState;
};

function measureRule(params: BuildRuleTriggerParams): TriggerMeasure {
  const { rule, reading, close } = params;
  switch (rule.kind) {
    case RULE_KIND.EMA_CROSS:
      return measureEmaCross({ rule, reading, close });
    case RULE_KIND.DONCHIAN_BREAKOUT:
    case RULE_KIND.BOLLINGER:
      return measureChannel({ rule, reading, close });
    case RULE_KIND.MACD:
      return measureMacd(rule, reading);
    case RULE_KIND.RSI:
      return measureRsi(rule, reading);
    case RULE_KIND.OBV_TREND:
      return measureObvTrend(rule, reading);
    case RULE_KIND.FEAR_GREED:
      return measureFearGreed(rule, params.sentiment);
  }
}

function opposite(direction: TriggerDirection): TriggerDirection {
  return direction === TRIGGER_DIRECTION.ABOVE ? TRIGGER_DIRECTION.BELOW : TRIGGER_DIRECTION.ABOVE;
}

// O limiar fica sempre do lado mais difícil: para cima quando o valor precisa subir, para baixo quando precisa cair.
function roundThreshold(
  value: EngineDecimalValue,
  direction: TriggerDirection,
): EngineDecimalValue {
  const mode =
    direction === TRIGGER_DIRECTION.ABOVE ? EngineDecimal.ROUND_CEIL : EngineDecimal.ROUND_FLOOR;
  return value.toDecimalPlaces(TRIGGER_DECIMAL_PLACES, mode);
}

function ceilPlaces(value: EngineDecimalValue): string {
  return formatEngineDecimal(
    value.toDecimalPlaces(TRIGGER_DECIMAL_PLACES, EngineDecimal.ROUND_CEIL),
  );
}

// O que ainda falta para o valor chegar ao limiar na direção pedida: positivo = falta, zero ou negativo = já passou.
function remaining(params: {
  readonly current: EngineDecimalValue;
  readonly threshold: EngineDecimalValue;
  readonly direction: TriggerDirection;
}): EngineDecimalValue {
  const { current, threshold } = params;
  return params.direction === TRIGGER_DIRECTION.ABOVE
    ? threshold.minus(current)
    : current.minus(threshold);
}

export function buildRuleTrigger(params: BuildRuleTriggerParams): RuleTrigger {
  const { rule, vote, state, close } = params;
  const measure = measureRule(params);
  const isEntry = state === TRIGGER_STATE.AWAITING_ENTRY;
  const direction = isEntry ? measure.entryDirection : opposite(measure.entryDirection);
  const threshold = roundThreshold(
    isEntry ? measure.entryThreshold : measure.exitThreshold,
    direction,
  );
  const { current } = measure;
  const distance = current === null ? null : remaining({ current, threshold, direction });
  const isPrice = measure.metric === TRIGGER_METRIC.CLOSE_PRICE;
  return {
    ruleId: rule.id,
    kind: rule.kind,
    family: vote.family,
    vote: vote.vote,
    weight: vote.weight,
    isMet: vote.vote === (isEntry ? 1 : -1),
    metric: measure.metric,
    direction,
    basis: measure.basis,
    current:
      current === null
        ? null
        : formatEngineDecimal(current.toDecimalPlaces(TRIGGER_DECIMAL_PLACES)),
    threshold: formatEngineDecimal(threshold),
    distance: distance === null ? null : ceilPlaces(distance),
    distanceRate: distance === null || !isPrice ? null : ceilPlaces(distance.dividedBy(close)),
  };
}
