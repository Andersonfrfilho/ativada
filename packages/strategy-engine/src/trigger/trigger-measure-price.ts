// Copyright (c) 2026 Ada Technology. All rights reserved.
import { decimalFromIndicator, EngineDecimal, type EngineDecimalValue } from '../engine-decimal.js';
import { readIndicatorOutput } from '../indicator-reading.js';
import type { RuleReading } from '../rule-reading.types.js';
import type { StrategyRule } from '../strategy-config.types.js';
import { TRIGGER_BASIS, TRIGGER_DIRECTION, TRIGGER_METRIC } from './trigger.constant.js';
import type { TriggerMeasure } from './trigger.types.js';

type EmaCrossRule = Extract<StrategyRule, { readonly kind: 'ema_cross' }>;
type PriceRule = Extract<StrategyRule, { readonly kind: 'donchian_breakout' | 'bollinger' }>;

const ONE = new EngineDecimal(1);
const TWO = new EngineDecimal(2);

function exponentialWeight(period: number): EngineDecimalValue {
  return TWO.dividedBy(period + 1);
}

// O fechamento `P` que iguala as duas EMAs no próximo candle: com α = 2/(n+1), rápida' = (1−αr)·rápida + αr·P e
// lenta' = (1−αl)·lenta + αl·P, então rápida' = lenta' em P = ((1−αl)·lenta − (1−αr)·rápida) / (αr − αl).
// Acima dele a rápida passa a lenta (compra); abaixo, fica sob ela (venda).
function crossingClose(params: {
  readonly rule: EmaCrossRule;
  readonly fast: EngineDecimalValue;
  readonly slow: EngineDecimalValue;
}): EngineDecimalValue {
  const { rule, fast, slow } = params;
  const fastWeight = exponentialWeight(rule.fastPeriod);
  const slowWeight = exponentialWeight(rule.slowPeriod);
  const numerator = ONE.minus(slowWeight).times(slow).minus(ONE.minus(fastWeight).times(fast));
  return numerator.dividedBy(fastWeight.minus(slowWeight));
}

export function measureEmaCross(params: {
  readonly rule: EmaCrossRule;
  readonly reading: RuleReading;
  readonly close: EngineDecimalValue;
}): TriggerMeasure {
  const { rule, reading } = params;
  const output = (name: string): EngineDecimalValue =>
    decimalFromIndicator(
      readIndicatorOutput({ value: reading.current, output: name, indicatorId: rule.id }),
    );
  const price = crossingClose({ rule, fast: output('fast'), slow: output('slow') });
  return {
    metric: TRIGGER_METRIC.CLOSE_PRICE,
    entryDirection: TRIGGER_DIRECTION.ABOVE,
    basis: TRIGGER_BASIS.EXACT,
    current: params.close,
    entryThreshold: price,
    exitThreshold: price,
  };
}

// Rompimento: o canal ATUAL (já com o candle de hoje) é o "anterior" do próximo fechamento, então o próximo fechamento
// compra acima da máxima atual e vende abaixo da mínima atual. Bandas de Bollinger: compra abaixo da inferior e
// vende acima da superior, pelas bandas de hoje (elas se movem com o candle seguinte: indicativo).
export function measureChannel(params: {
  readonly rule: PriceRule;
  readonly reading: RuleReading;
  readonly close: EngineDecimalValue;
}): TriggerMeasure {
  const { rule, reading } = params;
  const output = (name: string): EngineDecimalValue =>
    decimalFromIndicator(
      readIndicatorOutput({ value: reading.current, output: name, indicatorId: rule.id }),
    );
  const isBreakout = rule.kind === 'donchian_breakout';
  return {
    metric: TRIGGER_METRIC.CLOSE_PRICE,
    entryDirection: isBreakout ? TRIGGER_DIRECTION.ABOVE : TRIGGER_DIRECTION.BELOW,
    basis: isBreakout ? TRIGGER_BASIS.EXACT : TRIGGER_BASIS.INDICATIVE,
    current: params.close,
    entryThreshold: isBreakout ? output('upper') : output('lower'),
    exitThreshold: isBreakout ? output('lower') : output('upper'),
  };
}
