// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { Environment } from '../environment.js';
import type { RateLimiter } from '../rate-limit/rate-limiter.js';
import { createGoalColdBudget, type GoalColdBudget } from '../goals/goal-cold-budget.js';
import { createColdEvaluationGates, type ColdEvaluationGate } from '../goals/goal-cold-gate.js';
import type { GoalEvaluationView } from '../goals/goal-evaluation-view.js';
import type { HorizonEvaluation } from '../horizons/horizon-evaluation.types.js';

export type ColdEvaluationWiring = {
  readonly budget: GoalColdBudget;
  readonly goalGate: ColdEvaluationGate<GoalEvaluationView>;
  readonly horizonGate: ColdEvaluationGate<HorizonEvaluation>;
};

type ColdEvaluationWiringParams = {
  readonly environment: Pick<Environment, 'GOAL_EVALUATION_MAX_CONCURRENT'>;
  readonly rateLimiter: RateLimiter;
};

// RNF01: metas e prazos passam pelo MESMO portão (uma avaliação a frio em voo por usuário, teto global) e pelo mesmo orçamento.
export function createColdEvaluationWiring(
  params: ColdEvaluationWiringParams,
): ColdEvaluationWiring {
  const budget = createGoalColdBudget({ rateLimiter: params.rateLimiter });
  const gates = createColdEvaluationGates({
    maxConcurrent: params.environment.GOAL_EVALUATION_MAX_CONCURRENT,
    budget,
  });
  return {
    budget,
    goalGate: gates.forResult<GoalEvaluationView>(),
    horizonGate: gates.forResult<HorizonEvaluation>(),
  };
}
