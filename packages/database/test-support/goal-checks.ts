// Copyright (c) 2026 Ada Technology. All rights reserved.
import { GOAL_CREATE_OUTCOME, GOAL_DELETE_OUTCOME } from '../src/goals/goal.constant.js';
import { createGoalRepository } from '../src/goals/goal.repository.js';
import type { CreateGoalParams, GoalRecord } from '../src/goals/goal.types.js';
import type { OwnerScope } from '../src/ownership/owner-scope.js';
import type { LifecycleCheckContext } from './account-lifecycle-checks.js';
import { captureErrorCode, resolvePersistenceOwner } from './persistence-seed.js';

const CHECK_VIOLATION_SQLSTATE = '23514';
const RACED_GOALS = 12;
const GOAL_CEILING = 5;
const FIRST_PAGE_SIZE = 2;
const BASE: CreateGoalParams = {
  symbol: 'BTCUSDT',
  targetRate: '0.03',
  horizonDays: 30,
  maxLossRate: '0.05',
  maxGoals: 20,
};

async function createdGoal(
  goals: ReturnType<typeof createGoalRepository>,
  scope: OwnerScope,
  overrides: Partial<CreateGoalParams> = {},
): Promise<GoalRecord> {
  const created = await goals.createGoal(scope, { ...BASE, ...overrides });
  if (created.outcome !== GOAL_CREATE_OUTCOME.CREATED) throw new Error('meta não criada');
  return created.goal;
}

async function checkRoundTrip(context: LifecycleCheckContext): Promise<void> {
  const { handle, assertCondition, reportCheck } = context;
  const owner = await resolvePersistenceOwner(handle, 'subject-goal-round-trip');
  const goals = createGoalRepository(handle);
  const goal = await createdGoal(goals, owner.scope, { targetRate: '0.0375', maxLossRate: '0.05' });
  assertCondition(goal.isActive && goal.horizonDays === 30, 'meta nasce ativa com o prazo pedido');
  assertCondition(
    goal.targetRate === '0.0375' && goal.maxLossRate === '0.05',
    `taxas devem voltar exatas em texto: ${goal.targetRate} / ${goal.maxLossRate}`,
  );
  const found = await goals.findGoal(owner.scope, goal.id);
  assertCondition(found?.id === goal.id && found.symbol === 'BTCUSDT', 'meta lida pelo dono');
  const updated = await goals.updateGoal(owner.scope, goal.id, {
    isActive: false,
    horizonDays: 60,
    targetRate: '0.05',
  });
  if (updated === undefined) throw new Error('meta alterada não voltou');
  assertCondition(
    !updated.isActive && updated.horizonDays === 60 && updated.targetRate === '0.05',
    'PATCH grava só o que veio',
  );
  assertCondition(
    updated.maxLossRate === '0.05' && updated.symbol === 'BTCUSDT',
    'campos fora do PATCH ficam como estavam',
  );
  assertCondition(updated.updatedAt.getTime() >= goal.updatedAt.getTime(), 'updated_at avança');
  const deleted = await goals.deleteGoal(owner.scope, goal.id);
  const again = await goals.deleteGoal(owner.scope, goal.id);
  assertCondition(deleted === GOAL_DELETE_OUTCOME.DELETED, 'apagar a própria meta');
  assertCondition(again === GOAL_DELETE_OUTCOME.NOT_FOUND, 'apagar de novo = não encontrada');
  reportCheck('metas: criar, ler, alterar parcialmente e apagar; taxas voltam em texto exato');
}

async function checkPagination(context: LifecycleCheckContext): Promise<void> {
  const { handle, assertCondition, reportCheck } = context;
  const owner = await resolvePersistenceOwner(handle, 'subject-goal-pages');
  const goals = createGoalRepository(handle);
  const ids: string[] = [];
  for (const symbol of ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'XRPUSDT']) {
    ids.push((await createdGoal(goals, owner.scope, { symbol })).id);
  }
  const seen: string[] = [];
  let cursor = undefined as Awaited<ReturnType<typeof goals.listGoalsPage>>['nextCursor'];
  for (let page = 0; page < 5; page += 1) {
    const result = await goals.listGoalsPage(owner.scope, {
      limit: FIRST_PAGE_SIZE,
      after: cursor,
    });
    seen.push(...result.goals.map((goal) => goal.id));
    cursor = result.nextCursor;
    if (cursor === undefined) break;
  }
  assertCondition(
    seen.join() === [...ids].reverse().join(),
    'páginas: das mais novas para as mais antigas, sem repetir nem perder',
  );
  reportCheck('metas: paginação por cursor, mais novas primeiro, sem repetir nem perder linha');
}

async function checkCeilingUnderRace(context: LifecycleCheckContext): Promise<void> {
  const { handle, assertCondition, reportCheck } = context;
  const owner = await resolvePersistenceOwner(handle, 'subject-goal-ceiling');
  const goals = createGoalRepository(handle);
  const outcomes = await Promise.all(
    Array.from({ length: RACED_GOALS }, () =>
      goals.createGoal(owner.scope, { ...BASE, maxGoals: GOAL_CEILING }),
    ),
  );
  const created = outcomes.filter((outcome) => outcome.outcome === GOAL_CREATE_OUTCOME.CREATED);
  const page = await goals.listGoalsPage(owner.scope, { limit: 100, after: undefined });
  assertCondition(created.length === GOAL_CEILING, `${created.length} metas criadas sob corrida`);
  assertCondition(page.goals.length === GOAL_CEILING, `${page.goals.length} metas gravadas`);
  const other = await resolvePersistenceOwner(context.handle, 'subject-goal-ceiling-other');
  await createdGoal(goals, other.scope);
  reportCheck(`metas: ${RACED_GOALS} POST simultâneos respeitam o teto de ${GOAL_CEILING}`);
}

async function checkDatabaseRules(context: LifecycleCheckContext): Promise<void> {
  const { handle, client, assertCondition, reportCheck } = context;
  const owner = await resolvePersistenceOwner(handle, 'subject-goal-rules');
  const insert = (fields: {
    symbol: string;
    target: string;
    loss: string;
    days: number;
  }): PromiseLike<unknown> =>
    client`INSERT INTO goals (id, user_id, symbol, target_rate, horizon_days, max_loss_rate)
      VALUES (${crypto.randomUUID()}, ${owner.userId}, ${fields.symbol}, ${fields.target}, ${fields.days}, ${fields.loss})`;
  const valid = { symbol: 'BTCUSDT', target: '0.03', loss: '0.05', days: 30 };
  const invalid: readonly (readonly [string, typeof valid])[] = [
    ['par em minúsculas', { ...valid, symbol: 'btcusdt' }],
    ['par fora de USDT', { ...valid, symbol: 'BTCBRL' }],
    ['ganho zero', { ...valid, target: '0' }],
    ['ganho acima de 1000%', { ...valid, target: '10.01' }],
    ['perda zero', { ...valid, loss: '0' }],
    ['perda de 100%', { ...valid, loss: '1' }],
    ['prazo zero', { ...valid, days: 0 }],
    ['prazo de 366 dias', { ...valid, days: 366 }],
  ];
  for (const [label, fields] of invalid) {
    const code = await captureErrorCode(insert(fields));
    assertCondition(code === CHECK_VIOLATION_SQLSTATE, `${label}: o banco devia recusar (${code})`);
  }
  assertCondition((await captureErrorCode(insert(valid))) === undefined, 'a meta válida entra');
  reportCheck('metas: o banco recusa par, ganho, perda e prazo fora dos limites (CHECK)');
}

export async function checkGoals(context: LifecycleCheckContext): Promise<void> {
  await checkRoundTrip(context);
  await checkPagination(context);
  await checkCeilingUnderRace(context);
  await checkDatabaseRules(context);
}
