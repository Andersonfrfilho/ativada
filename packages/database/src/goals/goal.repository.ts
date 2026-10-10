// Copyright (c) 2026 Ada Technology. All rights reserved.
import { and, count, desc, eq, sql, type SQL } from 'drizzle-orm';

import { readOpenDatabase, type DatabaseHandle } from '../database-handle.js';
import type { DatabaseExecutor } from '../database-executor.js';
import { ownerCondition, type OwnerScope } from '../ownership/owner-scope.js';
import { isForeignKeyViolation } from '../postgres-error-code.js';
import { goals } from '../schema/goals.schema.js';
import { users } from '../schema/users.schema.js';
import {
  GOAL_CREATE_OUTCOME,
  GOAL_DELETE_OUTCOME,
  GOAL_PAGE_MAXIMUM_SIZE,
} from './goal.constant.js';
import { GOAL_COLUMNS, toGoalRecord } from './goal-record.mapper.js';
import type {
  CreateGoalParams,
  CreateGoalResult,
  GoalCursor,
  GoalDeleteOutcome,
  GoalPatch,
  GoalRecord,
  GoalRepository,
  GoalsPage,
  ListGoalsParams,
} from './goal.types.js';

type Database = ReturnType<typeof readOpenDatabase>['database'];

function ownedGoal(scope: OwnerScope, goalId: string): SQL | undefined {
  return and(ownerCondition(scope, goals.userId), eq(goals.id, goalId));
}

// O teto é conferido com a linha do dono TRAVADA: dois POST simultâneos não passam juntos do limite.
async function createGoal(
  database: Database,
  scope: OwnerScope,
  params: CreateGoalParams,
): Promise<CreateGoalResult> {
  return database.transaction(async (transaction): Promise<CreateGoalResult> => {
    await transaction
      .select({ id: users.id })
      .from(users)
      .where(eq(users.id, scope.ownerUserId))
      .for('no key update');
    const owned = await transaction
      .select({ total: count() })
      .from(goals)
      .where(ownerCondition(scope, goals.userId));
    if ((owned[0]?.total ?? 0) >= params.maxGoals) {
      return { outcome: GOAL_CREATE_OUTCOME.LIMIT_REACHED };
    }
    const rows = await transaction
      .insert(goals)
      .values({
        id: Bun.randomUUIDv7(),
        userId: scope.ownerUserId,
        symbol: params.symbol,
        targetRate: params.targetRate,
        horizonDays: params.horizonDays,
        maxLossRate: params.maxLossRate,
      })
      .returning(GOAL_COLUMNS);
    const goal = rows[0];
    if (goal === undefined) throw new Error('INSERT de goals não devolveu a linha');
    return { outcome: GOAL_CREATE_OUTCOME.CREATED, goal };
  });
}

async function findGoal(
  executor: DatabaseExecutor,
  scope: OwnerScope,
  goalId: string,
): Promise<GoalRecord | undefined> {
  const rows = await executor
    .select(GOAL_COLUMNS)
    .from(goals)
    .where(ownedGoal(scope, goalId))
    .limit(1);
  return rows[0];
}

function isBeforeCursor(after: GoalCursor | undefined): SQL | undefined {
  if (after === undefined) return undefined;
  return sql`(${goals.createdAt}, ${goals.id}) < (${after.createdAt}::timestamptz, ${after.id}::uuid)`;
}

// Mais recentes primeiro. O cursor leva `created_at::text` (microssegundos): o Date do JS repetiria linhas.
async function listGoalsPage(
  executor: DatabaseExecutor,
  scope: OwnerScope,
  params: ListGoalsParams,
): Promise<GoalsPage> {
  const limit = Math.min(Math.max(Math.trunc(params.limit), 1), GOAL_PAGE_MAXIMUM_SIZE);
  const rows = await executor
    .select({ ...GOAL_COLUMNS, createdAtText: sql<string>`${goals.createdAt}::text` })
    .from(goals)
    .where(and(ownerCondition(scope, goals.userId), isBeforeCursor(params.after)))
    .orderBy(desc(goals.createdAt), desc(goals.id))
    .limit(limit + 1);
  const page = rows.slice(0, limit);
  const last = page.at(-1);
  return {
    goals: page.map(toGoalRecord),
    nextCursor:
      rows.length > limit && last !== undefined
        ? { createdAt: last.createdAtText, id: last.id }
        : undefined,
  };
}

async function updateGoal(
  executor: DatabaseExecutor,
  scope: OwnerScope,
  target: { readonly goalId: string; readonly patch: GoalPatch },
): Promise<GoalRecord | undefined> {
  const { goalId, patch } = target;
  const rows = await executor
    .update(goals)
    .set({ ...patch, updatedAt: sql`now()` })
    .where(ownedGoal(scope, goalId))
    .returning(GOAL_COLUMNS);
  return rows[0];
}

// A meta que uma execução referencia não se apaga (FK RESTRICT): vira `in_use` e a API responde 409.
async function deleteGoal(
  executor: DatabaseExecutor,
  scope: OwnerScope,
  goalId: string,
): Promise<GoalDeleteOutcome> {
  try {
    const rows = await executor
      .delete(goals)
      .where(ownedGoal(scope, goalId))
      .returning({ id: goals.id });
    return rows.length > 0 ? GOAL_DELETE_OUTCOME.DELETED : GOAL_DELETE_OUTCOME.NOT_FOUND;
  } catch (error: unknown) {
    if (isForeignKeyViolation(error)) return GOAL_DELETE_OUTCOME.IN_USE;
    throw error;
  }
}

export function createGoalRepository(handle: DatabaseHandle): GoalRepository {
  const { database } = readOpenDatabase(handle);
  return {
    createGoal: (scope, params) => createGoal(database, scope, params),
    findGoal: (scope, goalId) => findGoal(database, scope, goalId),
    listGoalsPage: (scope, params) => listGoalsPage(database, scope, params),
    updateGoal: (scope, goalId, patch) => updateGoal(database, scope, { goalId, patch }),
    deleteGoal: (scope, goalId) => deleteGoal(database, scope, goalId),
  };
}
