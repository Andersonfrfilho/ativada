// Copyright (c) 2026 Ada Technology. All rights reserved.
import { ETH_DAILY } from '../../test/fixtures/live/goal-expected-outcome.fixture.js';
import type { GoalSpec } from '../../packages/strategy-engine/src/index.js';
import {
  createApiRunsContext,
  type ApiRunsContext,
} from '../api-runs-test/api-runs-test-context.js';
import { dataOf } from '../api-runs-test/api-runs-helpers.js';
import {
  closeLiveTestContext,
  LEAD_IN_CANDLES,
  type LiveTestContext,
  type LiveUser,
} from '../live-test/live-test-context.js';
import {
  closeTelegramTestContext,
  createTelegramTestContext,
  type TelegramTestContext,
} from '../telegram-test/telegram-test-context.js';
import { GOAL_SYMBOL, GOAL_TIMEFRAME } from './goals-test.constant.js';

export type GoalsTestContext = {
  readonly live: LiveTestContext;
  readonly api: ApiRunsContext;
  readonly telegram: TelegramTestContext;
};

export type CreatedRun = {
  readonly id: string;
  readonly goalId: string | null;
  readonly goalOutcome: string | null;
};

export async function createGoalsTestContext(live: LiveTestContext): Promise<GoalsTestContext> {
  return {
    live,
    api: await createApiRunsContext(live.databaseUrl),
    telegram: createTelegramTestContext(live),
  };
}

export async function closeGoalsTestContext(context: GoalsTestContext): Promise<void> {
  await context.api.stop();
  await closeTelegramTestContext(context.telegram);
  await closeLiveTestContext(context.live);
}

export async function createGoal(
  context: GoalsTestContext,
  params: { readonly user: LiveUser; readonly spec: GoalSpec; readonly symbol?: string },
): Promise<string> {
  const response = await context.api.call({
    subject: params.user.subject,
    method: 'POST',
    path: '/v1/goals',
    body: { symbol: params.symbol ?? GOAL_SYMBOL, ...params.spec },
  });
  return dataOf<{ readonly id: string }>(response, 201).id;
}

// Cria a simulação pela API, como o painel faz, e a recua para o início do conjunto histórico (a API a começa no candle
// aberto agora): é o único campo mexido à mão, e só para que o conjunto real vire o "mercado" dela.
export async function startGoalRun(
  context: GoalsTestContext,
  params: { readonly user: LiveUser; readonly goalId: string },
): Promise<CreatedRun> {
  const response = await context.api.call({
    subject: params.user.subject,
    method: 'POST',
    path: '/v1/runs',
    body: {
      strategyVersionId: params.user.versionId,
      kind: 'live_paper',
      symbol: GOAL_SYMBOL,
      timeframe: GOAL_TIMEFRAME,
      goalId: params.goalId,
    },
  });
  const run = dataOf<CreatedRun>(response, 202);
  const first = ETH_DAILY.candles[LEAD_IN_CANDLES];
  if (first === undefined) throw new Error('conjunto histórico curto demais');
  await context.live.client`UPDATE runs SET period_start = ${first.openTime} WHERE id = ${run.id}`;
  return run;
}
