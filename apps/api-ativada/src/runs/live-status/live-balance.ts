// Copyright (c) 2026 Ada Technology. All rights reserved.
import {
  EngineDecimal,
  formatEngineDecimal,
  toEngineDecimal,
  type EngineDecimalValue,
} from '@ativada/strategy-engine';

import {
  BUY_AND_HOLD_COMPARISON,
  EVEN_DIFFERENCE_POINTS,
  LIVE_RATE_DECIMAL_PLACES,
  PERCENT_MULTIPLIER,
  type BuyAndHoldComparison,
} from './live-status.constant.js';

export type LiveBalanceParams = {
  readonly initial: string;
  // O `equity` do último ponto gravado; ausente enquanto nenhuma vela fechou (o saldo é o inicial).
  readonly latestEquity: string | undefined;
};

export type LiveBalance = {
  readonly initial: string;
  readonly current: string;
  readonly result: string;
  readonly resultRate: string;
};

export type BuyAndHoldParams = {
  readonly initial: string;
  readonly current: string;
  // O `benchmark` do MESMO ponto de `equity_points` (spec 008, D12).
  readonly benchmark: string;
};

export type BuyAndHold = {
  readonly value: string;
  readonly resultRate: string;
  readonly differencePoints: string;
  readonly comparison: BuyAndHoldComparison;
};

// Taxa e diferença sempre para BAIXO (em direção a -infinito): o arredondamento nunca favorece a estratégia (RNF04).
function floorRate(value: EngineDecimalValue): EngineDecimalValue {
  return value.toDecimalPlaces(LIVE_RATE_DECIMAL_PLACES, EngineDecimal.ROUND_FLOOR);
}

// Saldo, resultado e taxa de resultado desde o início (ADR 0002, spec 008, L6). Dinheiro exato; a taxa é fração (0,03 = 3%).
export function computeLiveBalance(params: LiveBalanceParams): LiveBalance {
  const initial = toEngineDecimal(params.initial);
  const current =
    params.latestEquity === undefined ? initial : toEngineDecimal(params.latestEquity);
  const result = current.minus(initial);
  return {
    initial: formatEngineDecimal(initial),
    current: formatEngineDecimal(current),
    result: formatEngineDecimal(result),
    resultRate: formatEngineDecimal(floorRate(result.dividedBy(initial))),
  };
}

function compareDifference(differencePoints: EngineDecimalValue): BuyAndHoldComparison {
  const threshold = toEngineDecimal(EVEN_DIFFERENCE_POINTS);
  if (differencePoints.greaterThanOrEqualTo(threshold)) return BUY_AND_HOLD_COMPARISON.ABOVE;
  if (differencePoints.lessThanOrEqualTo(threshold.negated())) return BUY_AND_HOLD_COMPARISON.BELOW;
  return BUY_AND_HOLD_COMPARISON.EVEN;
}

// "Comprar e segurar" no mesmo ponto e a diferença da estratégia contra ele em pontos percentuais, calculada dos valores
// exatos (nunca das taxas já arredondadas), a estratégia menos o benchmark (L7).
export function computeBuyAndHold(params: BuyAndHoldParams): BuyAndHold {
  const initial = toEngineDecimal(params.initial);
  const value = toEngineDecimal(params.benchmark);
  const differencePoints = floorRate(
    toEngineDecimal(params.current).minus(value).times(PERCENT_MULTIPLIER).dividedBy(initial),
  );
  return {
    value: formatEngineDecimal(value),
    resultRate: formatEngineDecimal(floorRate(value.minus(initial).dividedBy(initial))),
    differencePoints: formatEngineDecimal(differencePoints),
    comparison: compareDifference(differencePoints),
  };
}
