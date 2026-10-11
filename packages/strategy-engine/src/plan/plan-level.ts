// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { SignalDecision } from '../engine-decision.types.js';
import { EngineDecimal, formatEngineDecimal, type EngineDecimalValue } from '../engine-decimal.js';
import { findTransition, type Transition } from './plan-boundary.js';
import type { PlanProbe } from './plan-probe.js';
import { PLAN_DECIMAL_PLACES, PLAN_DIRECTION, PLAN_STATUS, PLAN_TRIGGER } from './plan.constant.js';
import type { PlanLevel } from './plan.types.js';

export type LevelSearch = {
  readonly probe: PlanProbe;
  readonly lastClose: EngineDecimalValue;
  // O último fechamento na grade do tick e o maior índice que a busca cobre.
  readonly origin: number;
  readonly maximumIndex: number;
};

export type ResolveLevelParams = {
  readonly search: LevelSearch;
  readonly isFiring: (decision: SignalDecision) => boolean;
  // A regra já sinalizou no último candle fechado (decisão real, não hipotética).
  readonly wasActive: boolean;
};

const UNREACHABLE_LEVEL: PlanLevel = {
  status: PLAN_STATUS.UNREACHABLE,
  price: null,
  trigger: null,
  direction: null,
  distance: null,
  distanceRate: null,
};

function ceilPlaces(value: EngineDecimalValue): string {
  return formatEngineDecimal(value.toDecimalPlaces(PLAN_DECIMAL_PLACES, EngineDecimal.ROUND_CEIL));
}

function activeLevel(lastClose: EngineDecimalValue): PlanLevel {
  return {
    status: PLAN_STATUS.ALREADY_ACTIVE,
    price: formatEngineDecimal(lastClose),
    trigger: null,
    direction: null,
    distance: '0',
    distanceRate: '0',
  };
}

function priceLevel(search: LevelSearch, transition: Transition, firing: number): PlanLevel {
  const price = search.probe.priceOf(firing);
  const distance = price.minus(search.lastClose).abs();
  const quiet = firing === transition.same ? transition.different : transition.same;
  return {
    status: PLAN_STATUS.PRICE,
    price: formatEngineDecimal(price),
    trigger: quiet < firing ? PLAN_TRIGGER.AT_OR_ABOVE : PLAN_TRIGGER.AT_OR_BELOW,
    direction: price.greaterThan(search.lastClose) ? PLAN_DIRECTION.ABOVE : PLAN_DIRECTION.BELOW,
    distance: ceilPlaces(distance),
    distanceRate: ceilPlaces(distance.dividedBy(search.lastClose)),
  };
}

// O nível de UMA regra (ou do placar inteiro): já ativo, o fechamento mais próximo que a dispara (o par de ticks
// vizinhos em que ela dispara de um lado e não do outro), ou inalcançável na faixa de busca.
export function resolveLevel(params: ResolveLevelParams): PlanLevel {
  const { search, isFiring } = params;
  if (params.wasActive) return activeLevel(search.lastClose);
  const firesAt = (index: number): boolean => isFiring(search.probe.decide(index));
  const transition = findTransition({
    valueAt: firesAt,
    origin: search.origin,
    maximumIndex: search.maximumIndex,
  });
  const originFires = firesAt(search.origin);
  if (transition === undefined)
    return originFires ? activeLevel(search.lastClose) : UNREACHABLE_LEVEL;
  return priceLevel(search, transition, originFires ? transition.same : transition.different);
}
