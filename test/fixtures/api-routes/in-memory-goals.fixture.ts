// Copyright (c) 2026 Ada Technology. All rights reserved.
import {
  GOAL_CREATE_OUTCOME,
  GOAL_DELETE_OUTCOME,
} from '../../../packages/database/src/goals/goal.constant.js';
import type {
  GoalRecord,
  GoalRepository,
} from '../../../packages/database/src/goals/goal.types.js';
import type { OwnerScope } from '../../../packages/database/src/ownership/owner-scope.js';
import type { UserId } from '../../../packages/database/src/ownership/user-id.js';

type StoredGoal = { readonly userId: UserId; record: GoalRecord };

const UUID_SHAPE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

// O Postgres recusa texto que não é UUID (22P02, vira 500): a rota precisa barrar o id malformado ANTES de chegar aqui.
function assertUuid(goalId: unknown): void {
  if (typeof goalId !== 'string' || !UUID_SHAPE.test(goalId)) {
    throw new Error('invalid input syntax for type uuid');
  }
}

const EPOCH_MILLISECONDS = 1_700_000_000_000;
const MILLISECONDS_PER_ROW = 1_000;

export type InMemoryGoals = {
  readonly repository: GoalRepository;
  // Metas que uma execução referencia: apagar uma delas é `in_use`, como a FK RESTRICT do banco.
  readonly referenced: Set<string>;
  readonly calls: { findGoal: number };
  readonly allOf: (scope: OwnerScope) => readonly GoalRecord[];
};

// Espelha as regras do repositório real: tudo filtrado pelo dono, meta alheia some como se não existisse, o teto é
// conferido na criação e a página vai das mais novas para as mais antigas.
export function createInMemoryGoals(): InMemoryGoals {
  const stored: StoredGoal[] = [];
  const referenced = new Set<string>();
  const calls = { findGoal: 0 };
  let sequence = 0;

  function nextDate(): Date {
    sequence += 1;
    return new Date(EPOCH_MILLISECONDS + sequence * MILLISECONDS_PER_ROW);
  }

  function ownedBy(scope: OwnerScope): StoredGoal[] {
    return stored.filter((entry) => entry.userId === scope.ownerUserId);
  }

  const repository: GoalRepository = {
    createGoal: (scope, params) => {
      if (ownedBy(scope).length >= params.maxGoals) {
        return Promise.resolve({ outcome: GOAL_CREATE_OUTCOME.LIMIT_REACHED });
      }
      const createdAt = nextDate();
      const goal: GoalRecord = {
        id: crypto.randomUUID(),
        symbol: params.symbol,
        targetRate: params.targetRate,
        horizonDays: params.horizonDays,
        maxLossRate: params.maxLossRate,
        isActive: true,
        createdAt,
        updatedAt: createdAt,
      };
      stored.push({ userId: scope.ownerUserId, record: goal });
      return Promise.resolve({ outcome: GOAL_CREATE_OUTCOME.CREATED, goal });
    },
    findGoal: (scope, goalId) => {
      assertUuid(goalId);
      calls.findGoal += 1;
      return Promise.resolve(ownedBy(scope).find((entry) => entry.record.id === goalId)?.record);
    },
    listGoalsPage: (scope, params) => {
      const owned = ownedBy(scope)
        .map((entry) => entry.record)
        .reverse();
      const start =
        params.after === undefined ? 0 : owned.findIndex((row) => row.id === params.after?.id) + 1;
      const page = owned.slice(start, start + params.limit);
      const last = page.at(-1);
      const hasMore = start + params.limit < owned.length;
      return Promise.resolve({
        goals: page,
        nextCursor:
          hasMore && last !== undefined
            ? { createdAt: last.createdAt.toISOString(), id: last.id }
            : undefined,
      });
    },
    updateGoal: (scope, goalId, patch) => {
      assertUuid(goalId);
      const entry = ownedBy(scope).find((candidate) => candidate.record.id === goalId);
      if (entry === undefined) return Promise.resolve(undefined);
      entry.record = { ...entry.record, ...patch, updatedAt: nextDate() };
      return Promise.resolve(entry.record);
    },
    deleteGoal: (scope, goalId) => {
      assertUuid(goalId);
      const index = stored.findIndex(
        (entry) => entry.userId === scope.ownerUserId && entry.record.id === goalId,
      );
      if (index === -1) return Promise.resolve(GOAL_DELETE_OUTCOME.NOT_FOUND);
      if (referenced.has(goalId)) return Promise.resolve(GOAL_DELETE_OUTCOME.IN_USE);
      stored.splice(index, 1);
      return Promise.resolve(GOAL_DELETE_OUTCOME.DELETED);
    },
  };
  return {
    repository,
    referenced,
    calls,
    allOf: (scope) => ownedBy(scope).map((entry) => entry.record),
  };
}
