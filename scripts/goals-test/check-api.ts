// Copyright (c) 2026 Ada Technology. All rights reserved.
import { buildDailyCandles } from '../../test/fixtures/walk-forward/daily-candles.fixture.js';
import { ETH_DAILY } from '../../test/fixtures/live/goal-expected-outcome.fixture.js';
import { dataOf } from '../api-runs-test/api-runs-helpers.js';
import type { ApiResponse } from '../api-runs-test/api-runs-test-context.js';
import {
  assertCondition,
  cancelRun,
  seedCandles,
  type LiveUser,
} from '../live-test/live-test-context.js';
import {
  DAY_MILLISECONDS,
  EVALUATION_BUDGET_MILLISECONDS,
  GOAL_SYMBOL,
  MISSING_GOAL_ID,
  SYNTHETIC_DAYS,
  SYNTHETIC_SEEDS,
} from './goals-test.constant.js';
import { createGoal, startGoalRun, type GoalsTestContext } from './goals-test-context.js';

const SPEC = { targetRate: '0.05', maxLossRate: '0.1', horizonDays: 30 } as const;

type EvaluationData = {
  readonly evaluatedStrategies: number;
  readonly combinations: readonly { readonly rank: number; readonly isGoalSymbol: boolean }[];
  readonly unavailable: readonly unknown[];
};

function reportGoals(message: string): void {
  process.stdout.write(`goals-test: ${message}\n`);
}

function errorCodeOf(response: ApiResponse): string | undefined {
  return (response.json as { error?: { code?: string } } | undefined)?.error?.code;
}

async function expectStatus(
  context: GoalsTestContext,
  params: {
    readonly subject: string;
    readonly method?: string;
    readonly path: string;
    readonly body?: unknown;
    readonly status: number;
    readonly code?: string;
  },
): Promise<void> {
  const response = await context.api.call(params);
  assertCondition(
    response.status === params.status &&
      (params.code === undefined || errorCodeOf(response) === params.code),
    `${params.method ?? 'GET'} ${params.path}: ${response.status} ${response.text.slice(0, 200)}`,
  );
}

// Mercado diário sintético recente (o que a avaliação lê) para quatro dos cinco pares; o quinto, ETHUSDT, usa o conjunto real.
export async function seedEvaluationMarket(context: GoalsTestContext): Promise<void> {
  const today = Math.floor(Date.now() / DAY_MILLISECONDS) * DAY_MILLISECONDS;
  for (const [symbol, seed] of Object.entries(SYNTHETIC_SEEDS)) {
    const candles = buildDailyCandles({
      count: SYNTHETIC_DAYS,
      seed,
      firstOpenTime: today - SYNTHETIC_DAYS * DAY_MILLISECONDS,
      symbol,
    });
    await seedCandles(context.live, candles);
  }
  await seedCandles(context.live, ETH_DAILY.candles);
}

export async function checkCrudAndIsolation(
  context: GoalsTestContext,
  users: { readonly a: LiveUser; readonly b: LiveUser },
): Promise<void> {
  const { a, b } = users;
  const goalId = await createGoal(context, { user: a, spec: SPEC });
  const path = `/v1/goals/${goalId}`;
  const mine = dataOf<readonly { readonly id: string }[]>(
    await context.api.call({ subject: a.subject, path: '/v1/goals' }),
    200,
  );
  const theirs = dataOf<readonly unknown[]>(
    await context.api.call({ subject: b.subject, path: '/v1/goals' }),
    200,
  );
  assertCondition(mine.length === 1 && mine[0]?.id === goalId, 'a lista de A tem a meta de A');
  assertCondition(theirs.length === 0, 'B não vê a meta de A');
  for (const [method, suffix] of [
    ['GET', ''],
    ['GET', '/evaluation'],
    ['PATCH', ''],
    ['DELETE', ''],
  ] as const) {
    await expectStatus(context, {
      subject: b.subject,
      method,
      path: `${path}${suffix}`,
      ...(method === 'PATCH' ? { body: { isActive: false } } : {}),
      status: 404,
      code: 'GOAL_NOT_FOUND',
    });
  }
  await expectStatus(context, {
    subject: a.subject,
    path: `/v1/goals/${MISSING_GOAL_ID}`,
    status: 404,
    code: 'GOAL_NOT_FOUND',
  });
  reportGoals(
    'CRUD e isolamento: a meta de A não é lida, avaliada, alterada nem apagada por B (o mesmo 404 da inexistente)',
  );
  await checkLinking(context, { a, b, goalId });
}

async function checkLinking(
  context: GoalsTestContext,
  params: { readonly a: LiveUser; readonly b: LiveUser; readonly goalId: string },
): Promise<void> {
  const { a, b, goalId } = params;
  const body = (symbol: string, id: string): Record<string, unknown> => ({
    strategyVersionId: a.versionId,
    kind: 'live_paper',
    symbol,
    timeframe: '1d',
    goalId: id,
  });
  await expectStatus(context, {
    subject: a.subject,
    method: 'POST',
    path: '/v1/runs',
    body: body('BTCUSDT', goalId),
    status: 400,
  });
  await expectStatus(context, {
    subject: b.subject,
    method: 'POST',
    path: '/v1/runs',
    body: { ...body(GOAL_SYMBOL, goalId), strategyVersionId: b.versionId },
    status: 404,
    code: 'GOAL_NOT_FOUND',
  });
  await context.api.call({
    subject: a.subject,
    method: 'PATCH',
    path: `/v1/goals/${goalId}`,
    body: { isActive: false },
  });
  await expectStatus(context, {
    subject: a.subject,
    method: 'POST',
    path: '/v1/runs',
    body: body(GOAL_SYMBOL, goalId),
    status: 409,
    code: 'GOAL_INACTIVE',
  });
  await context.api.call({
    subject: a.subject,
    method: 'PATCH',
    path: `/v1/goals/${goalId}`,
    body: { isActive: true },
  });
  const run = await startGoalRun(context, { user: a, goalId });
  assertCondition(
    run.goalId === goalId && run.goalOutcome === null,
    'a simulação devolve a meta e ainda não tem desfecho',
  );
  await expectStatus(context, {
    subject: a.subject,
    method: 'DELETE',
    path: `/v1/goals/${goalId}`,
    status: 409,
    code: 'GOAL_IN_USE',
  });
  await cancelRun(context.live, { runId: run.id, user: a });
  await expectStatus(context, {
    subject: a.subject,
    method: 'DELETE',
    path: `/v1/goals/${goalId}`,
    status: 409,
    code: 'GOAL_IN_USE',
  });
  const spare = await createGoal(context, { user: a, spec: SPEC });
  await expectStatus(context, {
    subject: a.subject,
    method: 'DELETE',
    path: `/v1/goals/${spare}`,
    status: 204,
  });
  await expectStatus(context, {
    subject: a.subject,
    path: `/v1/goals/${spare}`,
    status: 404,
    code: 'GOAL_NOT_FOUND',
  });
  reportGoals(
    'meta atrelada: par diferente 400, meta alheia 404, meta desligada 409 GOAL_INACTIVE, meta em uso 409 GOAL_IN_USE (mesmo com a simulação cancelada); a sem uso é apagada (204)',
  );
}

const COLD_EVALUATION_ATTEMPTS = 3;

// A avaliação a frio é medida em metas novas (cache vazio); o melhor de 3 descarta a carga da máquina.
async function measureColdEvaluation(
  context: GoalsTestContext,
  params: { readonly user: LiveUser; readonly goalId: string },
): Promise<{ readonly cold: EvaluationData; readonly coldMilliseconds: number }> {
  let best: { cold: EvaluationData; coldMilliseconds: number } | undefined;
  for (let attempt = 0; attempt < COLD_EVALUATION_ATTEMPTS; attempt += 1) {
    const goalId =
      attempt === 0 ? params.goalId : await createGoal(context, { user: params.user, spec: SPEC });
    const startedAt = performance.now();
    const response = await context.api.call({
      subject: params.user.subject,
      path: `/v1/goals/${goalId}/evaluation`,
    });
    const coldMilliseconds = Math.round(performance.now() - startedAt);
    const cold = dataOf<EvaluationData>(response, 200);
    if (best === undefined || coldMilliseconds < best.coldMilliseconds) {
      best = { cold, coldMilliseconds };
    }
  }
  if (best === undefined) throw new Error('nenhuma avaliação a frio medida');
  return best;
}

export async function checkEvaluation(context: GoalsTestContext, user: LiveUser): Promise<void> {
  const goalId = await createGoal(context, { user, spec: SPEC });
  const path = `/v1/goals/${goalId}/evaluation`;
  const { cold, coldMilliseconds } = await measureColdEvaluation(context, { user, goalId });
  const cachedAt = performance.now();
  const warm = dataOf<EvaluationData>(await context.api.call({ subject: user.subject, path }), 200);
  const warmMilliseconds = Math.round(performance.now() - cachedAt);
  const budgetMilliseconds = EVALUATION_BUDGET_MILLISECONDS * cold.evaluatedStrategies;
  const total = cold.combinations.length + cold.unavailable.length;
  assertCondition(
    total === 5 * cold.evaluatedStrategies,
    `${cold.evaluatedStrategies} estratégias x 5 pares esperados, vieram ${total}`,
  );
  assertCondition(
    cold.combinations.length >= 4 * cold.evaluatedStrategies,
    `só ${cold.combinations.length} combinações avaliadas`,
  );
  assertCondition(
    coldMilliseconds < budgetMilliseconds,
    `avaliação a frio levou ${coldMilliseconds} ms (limite ${budgetMilliseconds} ms)`,
  );
  const ranks = cold.combinations.map((combination) => combination.rank);
  assertCondition(
    ranks.every((rank, index) => rank === index + 1),
    'o ranking é 1..N sem buraco',
  );
  assertCondition(
    cold.combinations.filter((combination) => combination.isGoalSymbol).length ===
      cold.evaluatedStrategies,
    `um par da meta por estratégia: ${JSON.stringify(cold.unavailable)}`,
  );
  assertCondition(
    JSON.stringify(warm.combinations) === JSON.stringify(cold.combinations),
    'o cache devolve a mesma avaliação',
  );
  assertCondition(
    warmMilliseconds <= coldMilliseconds,
    'a avaliação em cache não é mais lenta que a fria',
  );
  reportGoals(
    `avaliação estratégia x par: ${cold.combinations.length} combinações (${cold.evaluatedStrategies} estratégias x 5 pares) em ${coldMilliseconds} ms a frio (limite de ${EVALUATION_BUDGET_MILLISECONDS} ms por estratégia, ${budgetMilliseconds} ms) e ${warmMilliseconds} ms em cache, ranking 1..${ranks.length}, um par da meta`,
  );
}
