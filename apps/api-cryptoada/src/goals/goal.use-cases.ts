// Copyright (c) 2026 Ada Technology. All rights reserved.
import {
  GOAL_CREATE_OUTCOME,
  GOAL_DELETE_OUTCOME,
  type GoalCursor,
  type GoalPatch,
  type GoalRepository,
  type OwnerScope,
} from '@cryptoada/database';

import type { GoalColdBudget } from './goal-cold-budget.js';
import { encodeGoalCursor } from './goal-cursor.js';
import { toGoalView, type GoalView } from './goal-views.js';
import type { CreateGoalBody, PatchGoalBody } from './goal-requests.js';
import { GoalInUseError, GoalLimitReachedError, GoalNotFoundError } from './goal.error.js';

export type GoalUseCaseDependencies = {
  readonly goals: Pick<
    GoalRepository,
    'createGoal' | 'findGoal' | 'listGoalsPage' | 'updateGoal' | 'deleteGoal'
  >;
  readonly maxGoals: number;
};

// O PATCH que muda alvo, prazo ou perda máxima invalida o cache da avaliação: gasta o mesmo orçamento a frio dela.
export type GoalUpdateDependencies = GoalUseCaseDependencies & {
  readonly coldBudget: GoalColdBudget;
};

export type GoalPageInput = { readonly limit: number; readonly after: GoalCursor | undefined };

export type GoalPageOutput = {
  readonly items: readonly GoalView[];
  readonly nextCursor: string | null;
  readonly perPage: number;
};

export type CreateGoalUseCase = (scope: OwnerScope, body: CreateGoalBody) => Promise<GoalView>;
export type ListGoalsUseCase = (scope: OwnerScope, page: GoalPageInput) => Promise<GoalPageOutput>;
export type GetGoalUseCase = (scope: OwnerScope, goalId: string) => Promise<GoalView>;
export type UpdateGoalUseCase = (
  scope: OwnerScope,
  input: { readonly goalId: string; readonly patch: PatchGoalBody },
) => Promise<GoalView>;
export type DeleteGoalUseCase = (scope: OwnerScope, goalId: string) => Promise<void>;

export function createCreateGoalUseCase(dependencies: GoalUseCaseDependencies): CreateGoalUseCase {
  return async (scope, body) => {
    const created = await dependencies.goals.createGoal(scope, {
      ...body,
      maxGoals: dependencies.maxGoals,
    });
    if (created.outcome === GOAL_CREATE_OUTCOME.LIMIT_REACHED) throw new GoalLimitReachedError();
    return toGoalView(created.goal);
  };
}

export function createListGoalsUseCase(dependencies: GoalUseCaseDependencies): ListGoalsUseCase {
  return async (scope, page) => {
    const result = await dependencies.goals.listGoalsPage(scope, page);
    return {
      items: result.goals.map(toGoalView),
      nextCursor: result.nextCursor === undefined ? null : encodeGoalCursor(result.nextCursor),
      perPage: page.limit,
    };
  };
}

export function createGetGoalUseCase(dependencies: GoalUseCaseDependencies): GetGoalUseCase {
  return async (scope, goalId) => {
    const goal = await dependencies.goals.findGoal(scope, goalId);
    if (goal === undefined) throw new GoalNotFoundError();
    return toGoalView(goal);
  };
}

// O PATCH grava só o que veio: campo ausente fica como está, nunca vira NULL.
function definedFields(patch: PatchGoalBody): GoalPatch {
  return {
    ...(patch.symbol === undefined ? {} : { symbol: patch.symbol }),
    ...(patch.targetRate === undefined ? {} : { targetRate: patch.targetRate }),
    ...(patch.maxLossRate === undefined ? {} : { maxLossRate: patch.maxLossRate }),
    ...(patch.horizonDays === undefined ? {} : { horizonDays: patch.horizonDays }),
    ...(patch.isActive === undefined ? {} : { isActive: patch.isActive }),
  };
}

function changesEvaluation(patch: PatchGoalBody): boolean {
  return (
    patch.targetRate !== undefined ||
    patch.maxLossRate !== undefined ||
    patch.horizonDays !== undefined
  );
}

export function createUpdateGoalUseCase(dependencies: GoalUpdateDependencies): UpdateGoalUseCase {
  return async (scope, input) => {
    if (changesEvaluation(input.patch)) dependencies.coldBudget.charge(scope);
    const updated = await dependencies.goals.updateGoal(
      scope,
      input.goalId,
      definedFields(input.patch),
    );
    if (updated === undefined) throw new GoalNotFoundError();
    return toGoalView(updated);
  };
}

export function createDeleteGoalUseCase(dependencies: GoalUseCaseDependencies): DeleteGoalUseCase {
  return async (scope, goalId) => {
    const outcome = await dependencies.goals.deleteGoal(scope, goalId);
    if (outcome === GOAL_DELETE_OUTCOME.NOT_FOUND) throw new GoalNotFoundError();
    if (outcome === GOAL_DELETE_OUTCOME.IN_USE) throw new GoalInUseError();
  };
}
