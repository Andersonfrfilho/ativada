// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { SentimentObservation } from '../engine-candle.types.js';
import { decimalFromIndicator, EngineDecimal, type EngineDecimalValue } from '../engine-decimal.js';
import { readIndicatorOutput, readIndicatorScalar } from '../indicator-reading.js';
import type { RuleReading } from '../rule-reading.types.js';
import type { StrategyRule } from '../strategy-config.types.js';
import { TRIGGER_BASIS, TRIGGER_DIRECTION, TRIGGER_METRIC } from './trigger.constant.js';
import type { TriggerMeasure } from './trigger.types.js';

type RuleOf<TKind extends StrategyRule['kind']> = Extract<StrategyRule, { readonly kind: TKind }>;

const ZERO = new EngineDecimal(0);

function gapBetween(params: {
  readonly rule: StrategyRule;
  readonly reading: RuleReading;
  readonly minuend: string;
  readonly subtrahend: string;
}): EngineDecimalValue {
  const { rule, reading } = params;
  const output = (name: string): EngineDecimalValue =>
    decimalFromIndicator(
      readIndicatorOutput({ value: reading.current, output: name, indicatorId: rule.id }),
    );
  return output(params.minuend).minus(output(params.subtrahend));
}

// MACD e OBV: a diferença entre a linha e a sua média/sinal; votam a favor quando passa de zero.
function measureGap(params: {
  readonly metric: typeof TRIGGER_METRIC.MACD_GAP | typeof TRIGGER_METRIC.OBV_GAP;
  readonly gap: EngineDecimalValue;
}): TriggerMeasure {
  return {
    metric: params.metric,
    entryDirection: TRIGGER_DIRECTION.ABOVE,
    basis: TRIGGER_BASIS.INDICATIVE,
    current: params.gap,
    entryThreshold: ZERO,
    exitThreshold: ZERO,
  };
}

export function measureMacd(rule: RuleOf<'macd'>, reading: RuleReading): TriggerMeasure {
  const gap = gapBetween({ rule, reading, minuend: 'macd', subtrahend: 'signal' });
  return measureGap({ metric: TRIGGER_METRIC.MACD_GAP, gap });
}

export function measureObvTrend(rule: RuleOf<'obv_trend'>, reading: RuleReading): TriggerMeasure {
  const gap = gapBetween({ rule, reading, minuend: 'obv', subtrahend: 'ema' });
  return measureGap({ metric: TRIGGER_METRIC.OBV_GAP, gap });
}

// RSI: compra abaixo da sobrevenda e vende acima da sobrecompra (estritos).
export function measureRsi(rule: RuleOf<'rsi'>, reading: RuleReading): TriggerMeasure {
  const value = readIndicatorScalar({ value: reading.current, indicatorId: rule.id });
  return {
    metric: TRIGGER_METRIC.RSI,
    entryDirection: TRIGGER_DIRECTION.BELOW,
    basis: TRIGGER_BASIS.INDICATIVE,
    current: decimalFromIndicator(value),
    entryThreshold: new EngineDecimal(rule.oversold),
    exitThreshold: new EngineDecimal(rule.overbought),
  };
}

// Fear & Greed é contrário: compra no medo (≤), vende na ganância (≥). Sem observação fresca não há valor atual.
export function measureFearGreed(
  rule: RuleOf<'fear_greed'>,
  sentiment: SentimentObservation | null,
): TriggerMeasure {
  return {
    metric: TRIGGER_METRIC.FEAR_GREED_INDEX,
    entryDirection: TRIGGER_DIRECTION.BELOW,
    basis: TRIGGER_BASIS.INDICATIVE,
    current: sentiment === null ? null : new EngineDecimal(sentiment.value),
    entryThreshold: new EngineDecimal(rule.fearAtOrBelow),
    exitThreshold: new EngineDecimal(rule.greedAtOrAbove),
  };
}
