// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { EngineCandle, SentimentObservation } from '../engine-candle.types.js';
import type { SignalDecision } from '../engine-decision.types.js';
import { EngineDecimal, formatEngineDecimal, toEngineDecimal } from '../engine-decimal.js';
import type { SignalState } from '../engine-state.types.js';
import {
  REGIME_FILTER_KIND,
  RULE_FAMILY,
  RULE_KIND,
  SIGNAL_ACTION,
} from '../engine-vocabulary.constant.js';
import { parseGoalSpec } from '../goal/goal-spec.schema.js';
import type { GoalSpec } from '../goal/goal.types.js';
import { MILLISECONDS_PER_DAY } from '../metrics/metrics.constant.js';
import type { RunSetup, StrategyConfig, StrategyVersion } from '../strategy-config.types.js';
import { resolveLevel, type LevelSearch } from './plan-level.js';
import { computePlanLevels } from './plan-levels.js';
import { createPlanProbe } from './plan-probe.js';
import {
  PLAN_BASIS,
  PLAN_SEARCH_MAXIMUM_RATE,
  PLAN_VERSION,
  type PlanBasis,
} from './plan.constant.js';
import type { OperationPlan, PlanLevel, PlanRuleLevels } from './plan.types.js';

export type ComputeOperationPlanParams = {
  readonly strategy: StrategyVersion;
  readonly run: RunSetup;
  // O estado do sinal DEPOIS do último candle fechado, esse candle e a decisão que ele deu.
  readonly state: SignalState;
  readonly last: EngineCandle;
  readonly signal: SignalDecision;
  readonly sentiment: SentimentObservation | undefined;
  readonly goal: GoalSpec;
};

const ONE = new EngineDecimal(1);

// O OBV soma o volume do próximo candle e o filtro ADX depende da amplitude dele: nenhum dos dois existe ainda.
function isRuleIndicative(kind: StrategyConfig['rules'][number]['kind']): boolean {
  return kind === RULE_KIND.OBV_TREND;
}

function resolvePlanBasis(config: StrategyConfig): PlanBasis {
  const dependsOnNextCandle =
    config.regime.kind === REGIME_FILTER_KIND.ADX ||
    config.rules.some((rule) => isRuleIndicative(rule.kind));
  return dependsOnNextCandle ? PLAN_BASIS.INDICATIVE : PLAN_BASIS.EXACT;
}

function buildSearch(params: ComputeOperationPlanParams): LevelSearch {
  const tick = toEngineDecimal(params.run.parameters.tickSize);
  const lastClose = toEngineDecimal(params.last.close);
  const reach = lastClose.times(ONE.plus(PLAN_SEARCH_MAXIMUM_RATE));
  return {
    probe: createPlanProbe(params),
    lastClose,
    origin: lastClose.dividedBy(tick).toDecimalPlaces(0, EngineDecimal.ROUND_HALF_UP).toNumber(),
    maximumIndex: reach.dividedBy(tick).floor().toNumber(),
  };
}

function buildRuleLevels(params: {
  readonly params: ComputeOperationPlanParams;
  readonly search: LevelSearch;
}): readonly PlanRuleLevels[] {
  const { search } = params;
  const { strategy, signal } = params.params;
  return strategy.config.rules.map((rule, index) => {
    const levelFor = (wanted: -1 | 1): PlanLevel =>
      resolveLevel({
        search,
        isFiring: (decision) => decision.votes[index]?.vote === wanted,
        wasActive: signal.votes[index]?.vote === wanted,
      });
    return {
      ruleId: rule.id,
      kind: rule.kind,
      family: RULE_FAMILY[rule.kind],
      basis: isRuleIndicative(rule.kind) ? PLAN_BASIS.INDICATIVE : PLAN_BASIS.EXACT,
      buy: levelFor(1),
      exit: levelFor(-1),
    };
  });
}

function resolveProtection(params: {
  readonly entryReference: string | null;
  readonly run: RunSetup;
  readonly goal: GoalSpec;
}): Pick<OperationPlan, 'target' | 'stop'> {
  if (params.entryReference === null) return { target: null, stop: null };
  const levels = computePlanLevels({
    entry: toEngineDecimal(params.entryReference),
    parameters: params.run.parameters,
    goal: params.goal,
  });
  return { target: levels.target, stop: levels.stop };
}

// O plano de operação (RF13, ADR 0002 §"Plano de operação (T4b.5)"): PURO, sobre o estado do sinal depois do último candle
// fechado. O preço de compra e o de saída são os fechamentos do PRÓXIMO candle que fazem o placar sinalizar COMPRA e VENDA,
// achados com o próprio `signalStep` de produção sobre um candle hipotético (ver `buildNextCandle`), no tick exato; o mesmo
// vale para o voto de cada regra. Alvo e stop partem do preço de compra (ou do último fechamento, se o sinal já está ativo).
export function computeOperationPlan(params: ComputeOperationPlanParams): OperationPlan {
  const goal = parseGoalSpec(params.goal);
  const { strategy, run, last, signal } = params;
  const search = buildSearch(params);
  const buy = resolveLevel({
    search,
    isFiring: (decision) => decision.action === SIGNAL_ACTION.BUY,
    wasActive: signal.action === SIGNAL_ACTION.BUY,
  });
  const startsAt = last.closeTime + 1;
  return {
    version: PLAN_VERSION,
    lastCloseTime: last.closeTime,
    lastClose: formatEngineDecimal(search.lastClose),
    basis: resolvePlanBasis(strategy.config),
    signal: { action: signal.action, score: signal.score },
    buy,
    exit: resolveLevel({
      search,
      isFiring: (decision) => decision.action === SIGNAL_ACTION.SELL,
      wasActive: signal.action === SIGNAL_ACTION.SELL,
    }),
    entryReference: buy.price,
    ...resolveProtection({ entryReference: buy.price, run, goal }),
    startsAt,
    deadlineAt: startsAt + goal.horizonDays * MILLISECONDS_PER_DAY,
    horizonDays: goal.horizonDays,
    rules: buildRuleLevels({ params, search }),
  };
}
