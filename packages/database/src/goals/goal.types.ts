// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { OwnerScope } from '../ownership/owner-scope.js';
import type { GOAL_CREATE_OUTCOME, GOAL_DELETE_OUTCOME } from './goal.constant.js';

// `targetRate` e `maxLossRate` são frações do saldo em texto decimal ("0.03" = 3%), como o motor as lê.
export type GoalRecord = {
  readonly id: string;
  readonly symbol: string;
  readonly targetRate: string;
  readonly horizonDays: number;
  readonly maxLossRate: string;
  readonly isActive: boolean;
  readonly createdAt: Date;
  readonly updatedAt: Date;
};

export type GoalFields = {
  readonly symbol: string;
  readonly targetRate: string;
  readonly horizonDays: number;
  readonly maxLossRate: string;
};

// `maxGoals`: o teto de metas do dono, conferido sob trava na MESMA transação do INSERT.
export type CreateGoalParams = GoalFields & { readonly maxGoals: number };

export type CreateGoalResult =
  | { readonly outcome: typeof GOAL_CREATE_OUTCOME.CREATED; readonly goal: GoalRecord }
  | { readonly outcome: typeof GOAL_CREATE_OUTCOME.LIMIT_REACHED };

export type GoalPatch = Partial<GoalFields & { readonly isActive: boolean }>;

export type GoalCursor = { readonly createdAt: string; readonly id: string };

export type ListGoalsParams = { readonly limit: number; readonly after: GoalCursor | undefined };

export type GoalsPage = {
  readonly goals: readonly GoalRecord[];
  readonly nextCursor: GoalCursor | undefined;
};

export type GoalDeleteOutcome = (typeof GOAL_DELETE_OUTCOME)[keyof typeof GOAL_DELETE_OUTCOME];

// Toda leitura e escrita é filtrada pelo dono; meta alheia ou inexistente é `undefined` / `not_found`, sem distinção.
export type GoalRepository = {
  readonly createGoal: (scope: OwnerScope, params: CreateGoalParams) => Promise<CreateGoalResult>;
  readonly findGoal: (scope: OwnerScope, goalId: string) => Promise<GoalRecord | undefined>;
  readonly listGoalsPage: (scope: OwnerScope, params: ListGoalsParams) => Promise<GoalsPage>;
  readonly updateGoal: (
    scope: OwnerScope,
    goalId: string,
    patch: GoalPatch,
  ) => Promise<GoalRecord | undefined>;
  readonly deleteGoal: (scope: OwnerScope, goalId: string) => Promise<GoalDeleteOutcome>;
};
