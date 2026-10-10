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
  type SeededStrategy,
} from './fixtures/api-routes/runs-harness.fixture.js';
import { expectIndistinguishableNotFound } from './fixtures/not-found-response.fixture.js';

const RUNS = '/v1/runs';
const GOALS = '/v1/goals';
const GOAL_BODY = { symbol: 'BTCUSDT', targetRate: '0.03', horizonDays: 30, maxLossRate: '0.05' };

let harness: GoalsHarness;
let seededA: SeededStrategy;
let seededB: SeededStrategy;
let testIndex = 0;

type ErrorBody = { error: { code: string; details?: { field: string; reason: string }[] } };
type RunData = {
  id: string;
  goalId: string | null;
  goalOutcome: string | null;
  kind: string;
  status: string;
};

beforeAll(async () => {
  harness = await createGoalsHarness({ maxGoals: 50 });
  seededA = await harness.seedStrategy(SUBJECT_A, 'a');
  seededB = await harness.seedStrategy(SUBJECT_B, 'b');
});

afterAll(async () => {
  await harness.stop();
});

// Cada teste anda dois minutos no relógio injetado: os limites por minuto não se acumulam entre os testes.
beforeEach(() => {
  for (const run of harness.runs.all()) {
    if (run.status === 'queued' || run.status === 'running') {
      harness.runs.updateRun(run.id, { status: 'cancelled', finishedAt: new Date() });
    }
  }
  testIndex += 1;
  harness.clock.now = Date.UTC(2026, 9, 1) + testIndex * 120_000;
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
      body: { ...GOAL_BODY, ...overrides },
    }),
  );
  return (body as { data: { id: string } }).data.id;
}

function liveBody(
  strategy: SeededStrategy,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    strategyVersionId: strategy.versionId,
    kind: 'live_paper',
    symbol: 'BTCUSDT',
    timeframe: '1d',
    ...overrides,
  };
}

async function startRun(
  subject: string,
  body: Record<string, unknown>,
): Promise<{ status: number; body: unknown }> {
  return readJson(await harness.call({ subject, method: 'POST', path: RUNS, body }));
}

describe('POST /v1/runs com goalId: simulação ao vivo atrelada a uma meta', () => {
  test('cria a simulação ligada à meta e guarda a fotografia da meta no pedido', async () => {
    const goalId = await createGoal(SUBJECT_A);
    const { status, body } = await startRun(SUBJECT_A, liveBody(seededA, { goalId }));
    const data = (body as { data: RunData }).data;
    expect(status).toBe(202);
    expect(data).toMatchObject({ kind: 'live_paper', status: 'queued', goalId, goalOutcome: null });
    const stored = harness.runs.all().find((run) => run.id === data.id);
    expect(stored?.goalId).toBe(goalId);
    expect(stored?.request).toStrictEqual({
      goal: { targetRate: '0.03', maxLossRate: '0.05', horizonDays: 30 },
    });
  });

  test('a fotografia convive com a configuração do piso e da meta de dobro', async () => {
    const goalId = await createGoal(SUBJECT_A);
    const { body } = await startRun(
      SUBJECT_A,
      liveBody(seededA, { goalId, survival: { floorRate: '0.9' } }),
    );
    const stored = harness.runs.all().find((run) => run.id === (body as { data: RunData }).data.id);
    expect(stored?.request).toStrictEqual({
      survival: { floorRate: '0.9', doubleRate: '2' },
      goal: { targetRate: '0.03', maxLossRate: '0.05', horizonDays: 30 },
    });
  });

  test('alterar a meta depois não muda a simulação em andamento (a fotografia é da criação)', async () => {
    const goalId = await createGoal(SUBJECT_A);
    const { body } = await startRun(SUBJECT_A, liveBody(seededA, { goalId }));
    await harness.call({
      subject: SUBJECT_A,
      method: 'PATCH',
      path: `${GOALS}/${goalId}`,
      body: { targetRate: '0.09', horizonDays: 7 },
    });
    const stored = harness.runs.all().find((run) => run.id === (body as { data: RunData }).data.id);
    expect(stored?.request).toStrictEqual({
      goal: { targetRate: '0.03', maxLossRate: '0.05', horizonDays: 30 },
    });
  });

  test('GET /v1/runs/:id e a lista mostram goalId e goalOutcome; execução sem meta mostra nulos', async () => {
    const goalId = await createGoal(SUBJECT_A);
    const { body } = await startRun(SUBJECT_A, liveBody(seededA, { goalId }));
    const runId = (body as { data: RunData }).data.id;
    const read = (
      await readJson(await harness.call({ subject: SUBJECT_A, path: `${RUNS}/${runId}` }))
    ).body as { data: RunData };
    expect(read.data).toMatchObject({ goalId, goalOutcome: null });
    const plain = (await startRun(SUBJECT_A, liveBody(seededA, { symbol: 'ETHUSDT' }))).body as {
      data: RunData;
    };
    expect(plain.data).toMatchObject({ goalId: null, goalOutcome: null });
  });

  test('o desfecho gravado pelo worker aparece na execução', async () => {
    const goalId = await createGoal(SUBJECT_A);
    const { body } = await startRun(SUBJECT_A, liveBody(seededA, { goalId }));
    const runId = (body as { data: RunData }).data.id;
    harness.runs.updateRun(runId, {
      status: 'completed',
      goalOutcome: 'goal_stopped',
      goalOutcomeCandleTime: 1,
      finishedAt: new Date(),
    });
    const read = (
      await readJson(await harness.call({ subject: SUBJECT_A, path: `${RUNS}/${runId}` }))
    ).body as { data: RunData };
    expect(read.data).toMatchObject({ status: 'completed', goalId, goalOutcome: 'goal_stopped' });
    const listed = (
      await readJson(
        await harness.call({ subject: SUBJECT_A, path: `${RUNS}?kind=live_paper&limit=100` }),
      )
    ).body as { data: RunData[] };
    expect(listed.data.find((run) => run.id === runId)?.goalOutcome).toBe('goal_stopped');
  });

  test('a resposta bate com o esquema documentado', async () => {
    const goalId = await createGoal(SUBJECT_A);
    const route = harness.routes.find(
      (candidate) => candidate.path === RUNS && candidate.method === 'POST',
    );
    const { body } = await startRun(SUBJECT_A, liveBody(seededA, { goalId }));
    expect(
      route?.documentation?.successes[0]?.schema?.safeParse((body as { data: unknown }).data)
        .success,
    ).toBe(true);
  });

  test('a meta fica em uso: apagá-la é 409 GOAL_IN_USE', async () => {
    const goalId = await createGoal(SUBJECT_A);
    await startRun(SUBJECT_A, liveBody(seededA, { goalId }));
    const refused = await harness.call({
      subject: SUBJECT_A,
      method: 'DELETE',
      path: `${GOALS}/${goalId}`,
    });
    expect(refused.status).toBe(409);
    expect(((await refused.json()) as ErrorBody).error.code).toBe('GOAL_IN_USE');
  });

  test('meta de outro usuário e meta inexistente respondem 404 GOAL_NOT_FOUND, idênticos', async () => {
    const goalOfA = await createGoal(SUBJECT_A);
    const call = (goalId: string): Promise<Response> =>
      harness.call({
        subject: SUBJECT_B,
        method: 'POST',
        path: RUNS,
        body: liveBody(seededB, { goalId }),
      });
    await expectIndistinguishableNotFound({
      expectedCode: 'GOAL_NOT_FOUND',
      foreignResourceResponse: await call(goalOfA),
      missingResourceResponse: await call(MISSING_ID),
    });
    expect(harness.runs.all().filter((run) => run.goalId === goalOfA)).toHaveLength(0);
  });

  test('meta desligada é 409 GOAL_INACTIVE e nenhuma execução nasce', async () => {
    const goalId = await createGoal(SUBJECT_A);
    await harness.call({
      subject: SUBJECT_A,
      method: 'PATCH',
      path: `${GOALS}/${goalId}`,
      body: { isActive: false },
    });
    const before = harness.runs.all().length;
    const { status, body } = await startRun(SUBJECT_A, liveBody(seededA, { goalId }));
    expect(status).toBe(409);
    expect((body as ErrorBody).error.code).toBe('GOAL_INACTIVE');
    expect(harness.runs.all()).toHaveLength(before);
  });

  test('par da simulação diferente do par da meta é 400 no campo goalId', async () => {
    const goalId = await createGoal(SUBJECT_A, { symbol: 'ETHUSDT' });
    const { status, body } = await startRun(SUBJECT_A, liveBody(seededA, { goalId }));
    expect(status).toBe(400);
    expect((body as ErrorBody).error.details).toStrictEqual([
      { field: 'goalId', reason: 'goal_symbol_mismatch' },
    ]);
  });

  test.each(['backtest', 'walk_forward'] as const)(
    '%s não aceita meta: 400 not_allowed_for_kind',
    async (kind) => {
      const goalId = await createGoal(SUBJECT_A);
      const { status, body } = await startRun(
        SUBJECT_A,
        liveBody(seededA, { goalId, kind, timeframe: '1h', periodStart: 1, periodEnd: 2 }),
      );
      expect(status).toBe(400);
      expect(
        (body as ErrorBody).error.details?.some(
          (detail) => detail.field === 'goalId' && detail.reason === 'not_allowed_for_kind',
        ),
      ).toBe(true);
    },
  );

  test('goalId malformado é 400 de validação, sem eco do valor', async () => {
    const response = await harness.call({
      subject: SUBJECT_A,
      method: 'POST',
      path: RUNS,
      body: liveBody(seededA, { goalId: 'valor-secreto-9' }),
    });
    const text = await response.text();
    expect(response.status).toBe(400);
    expect(text).not.toContain('valor-secreto');
    expect((JSON.parse(text) as ErrorBody).error.details?.map((detail) => detail.field)).toContain(
      'goalId',
    );
  });

  test('o teto de simulações ao vivo continua valendo para as de meta', async () => {
    const goalId = await createGoal(SUBJECT_A);
    const statuses: number[] = [];
    for (let created = 0; created < 7; created += 1) {
      statuses.push((await startRun(SUBJECT_A, liveBody(seededA, { goalId }))).status);
    }
    expect(statuses.slice(0, 5)).toStrictEqual([202, 202, 202, 202, 202]);
    expect(statuses.slice(5)).toStrictEqual([409, 409]);
  });
});
