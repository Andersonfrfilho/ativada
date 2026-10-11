// Copyright (c) 2026 Ada Technology. All rights reserved.
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';

import {
  createGoalsHarness,
  type GoalsHarness,
} from './fixtures/api-routes/goals-harness.fixture.js';
import {
  MISSING_ID,
  readJson,
  SUBJECT_A,
  SUBJECT_B,
} from './fixtures/api-routes/runs-harness.fixture.js';
import { expectIndistinguishableNotFound } from './fixtures/not-found-response.fixture.js';

const GOALS = '/v1/goals';
const WITHOUT_CANDLES = 'ADAUSDT';
const BASE_GOAL = { symbol: 'BTCUSDT', targetRate: '0.03', horizonDays: 30, maxLossRate: '0.05' };

type PlanBody = {
  data: {
    goal: { id: string };
    strategy: { id: string; versionId: string };
    symbol: string;
    candlesUsed: number;
    lastCandleOpenTime: number;
    deadline: string;
    plan: {
      version: string;
      lastCloseTime: number;
      startsAt: number;
      deadlineAt: number;
      basis: string;
      horizonDays: number;
      buy: { status: string };
      target: { rate: string; price: string } | null;
      stop: { rate: string; price: string } | null;
      rules: { kind: string }[];
    };
  };
};

let harness: GoalsHarness;
let strategyA: { strategyId: string; versionId: string };
let strategyB: { strategyId: string; versionId: string };

beforeAll(async () => {
  harness = await createGoalsHarness({ symbolsWithoutCandles: [WITHOUT_CANDLES], maxGoals: 50 });
  strategyA = await harness.seedStrategy(SUBJECT_A, 'a');
  strategyB = await harness.seedStrategy(SUBJECT_B, 'b');
});

afterAll(async () => {
  await harness.stop();
});

// A rota divide a cota por minuto com a avaliação: cada teste anda dois minutos no relógio injetado.
beforeEach(() => {
  harness.clock.now += 2 * 60_000;
});

async function createGoal(
  subject: string,
  overrides: Record<string, unknown> = {},
): Promise<string> {
  const { body } = await readJson(
    await harness.call({
      subject,
      method: 'POST',
      path: GOALS,
      body: { ...BASE_GOAL, ...overrides },
    }),
  );
  return (body as { data: { id: string } }).data.id;
}

function plan(subject: string, goalId: string, strategyId?: string): Promise<Response> {
  const query = strategyId === undefined ? '' : `?strategyId=${strategyId}`;
  return harness.call({ subject, path: `${GOALS}/${goalId}/plan${query}` });
}

describe('GET /v1/goals/:id/plan', () => {
  test('exige token', async () => {
    const goalId = await createGoal(SUBJECT_A);
    expect((await harness.call({ path: `${GOALS}/${goalId}/plan` })).status).toBe(401);
  });

  test('devolve o plano do dono no par da meta, com prazo ISO, alvo e as quatro regras', async () => {
    const goalId = await createGoal(SUBJECT_A);
    const response = await plan(SUBJECT_A, goalId, strategyA.strategyId);
    const body = (await response.json()) as PlanBody;
    expect(response.status).toBe(200);
    expect(body.data.goal.id).toBe(goalId);
    expect(body.data.strategy).toMatchObject({
      id: strategyA.strategyId,
      versionId: strategyA.versionId,
    });
    expect(body.data.symbol).toBe('BTCUSDT');
    expect(body.data.plan.version).toBe('plan-1');
    expect(body.data.plan.basis).toBe('indicative');
    expect(body.data.plan.rules.map((rule) => rule.kind)).toStrictEqual([
      'ema_cross',
      'macd',
      'rsi',
      'obv_trend',
    ]);
    expect(body.data.deadline).toBe(new Date(body.data.plan.deadlineAt).toISOString());
    expect(body.data.plan.deadlineAt).toBe(body.data.plan.startsAt + 30 * 86_400_000);
    expect(body.data.plan.startsAt).toBe(body.data.plan.lastCloseTime + 1);
    expect(body.data.plan.target?.rate).toBe('0.03');
  });

  test('a resposta bate com o esquema documentado', async () => {
    const route = harness.routes.find((candidate) => candidate.path === `${GOALS}/:goalId/plan`);
    const goalId = await createGoal(SUBJECT_A);
    const body = (await (await plan(SUBJECT_A, goalId, strategyA.strategyId)).json()) as {
      data: unknown;
    };
    expect(route?.documentation?.successes[0]?.schema?.safeParse(body.data).success).toBe(true);
  });

  test.each([
    ['sem strategyId', undefined],
    ['strategyId malformado', 'nao-e-uuid'],
  ])('%s: 400 com os detalhes de validação', async (_name, strategyId) => {
    const goalId = await createGoal(SUBJECT_A);
    const { status, body } = await readJson(await plan(SUBJECT_A, goalId, strategyId));
    expect(status).toBe(400);
    expect((body as { error: { code: string } }).error.code).toBe('REQUEST_VALIDATION_FAILED');
  });

  test('contrato negativo: meta de outro usuário é idêntica a meta inexistente', async () => {
    const goalId = await createGoal(SUBJECT_A);
    await expectIndistinguishableNotFound({
      expectedCode: 'GOAL_NOT_FOUND',
      foreignResourceResponse: await plan(SUBJECT_B, goalId, strategyB.strategyId),
      missingResourceResponse: await plan(SUBJECT_B, MISSING_ID, strategyB.strategyId),
    });
  });

  test('contrato negativo: estratégia de outro usuário é idêntica a estratégia inexistente', async () => {
    const goalId = await createGoal(SUBJECT_B);
    await expectIndistinguishableNotFound({
      expectedCode: 'STRATEGY_NOT_FOUND',
      foreignResourceResponse: await plan(SUBJECT_B, goalId, strategyA.strategyId),
      missingResourceResponse: await plan(SUBJECT_B, goalId, MISSING_ID),
    });
  });

  test('par sem candles: 409 GOAL_PLAN_UNAVAILABLE', async () => {
    const goalId = await createGoal(SUBJECT_A, { symbol: WITHOUT_CANDLES });
    const { status, body } = await readJson(await plan(SUBJECT_A, goalId, strategyA.strategyId));
    expect(status).toBe(409);
    expect((body as { error: { code: string } }).error.code).toBe('GOAL_PLAN_UNAVAILABLE');
  });

  test('repetir a chamada dá o mesmo plano; candle novo muda a chave e o plano acompanha', async () => {
    const goalId = await createGoal(SUBJECT_A, { horizonDays: 14 });
    const first = (await (await plan(SUBJECT_A, goalId, strategyA.strategyId)).json()) as PlanBody;
    const again = (await (await plan(SUBJECT_A, goalId, strategyA.strategyId)).json()) as PlanBody;
    expect(again).toStrictEqual(first);
    const last = harness.candleRecords.filter((candle) => candle.symbol === 'BTCUSDT').at(-1);
    if (last === undefined) throw new Error('sem candle');
    const DAY = 86_400_000;
    harness.candleRecords.push({
      ...last,
      openTime: last.openTime + DAY,
      closeTime: last.closeTime + DAY,
    });
    harness.clock.now += DAY;
    const next = (await (await plan(SUBJECT_A, goalId, strategyA.strategyId)).json()) as PlanBody;
    expect(next.data.plan.lastCloseTime).toBe(first.data.plan.lastCloseTime + DAY);
    expect(next.data.candlesUsed).toBe(first.data.candlesUsed + 1);
  });

  test.each([
    ['o ganho alvo', { targetRate: '0.08' }],
    ['a perda máxima', { maxLossRate: '0.02' }],
    ['o prazo', { horizonDays: 7 }],
  ])('alterar %s muda o plano: o cache não guarda a meta antiga', async (_name, patch) => {
    const goalId = await createGoal(SUBJECT_A, { horizonDays: 21 });
    const before = (await (await plan(SUBJECT_A, goalId, strategyA.strategyId)).json()) as PlanBody;
    await harness.call({
      subject: SUBJECT_A,
      method: 'PATCH',
      path: `${GOALS}/${goalId}`,
      body: patch,
    });
    const after = (await (await plan(SUBJECT_A, goalId, strategyA.strategyId)).json()) as PlanBody;
    expect(after.data.plan).not.toStrictEqual(before.data.plan);
    expect(after.data.plan.target?.rate).toBe('targetRate' in patch ? '0.08' : '0.03');
    expect(after.data.plan.stop?.rate).toBe('maxLossRate' in patch ? '0.02' : '0.05');
    expect(after.data.plan.horizonDays).toBe('horizonDays' in patch ? 7 : 21);
  });

  test('a rota tem limite por usuário: a 21ª chamada no mesmo minuto é 429', async () => {
    const goalId = await createGoal(SUBJECT_A, { horizonDays: 45 });
    const statuses: number[] = [];
    for (let call = 0; call < 21; call += 1) {
      statuses.push((await plan(SUBJECT_A, goalId, strategyA.strategyId)).status);
    }
    expect(statuses.slice(0, 20).every((status) => status === 200)).toBe(true);
    expect(statuses[20]).toBe(429);
  });
});
