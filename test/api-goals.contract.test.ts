// Copyright (c) 2026 Ada Technology. All rights reserved.
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';

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
const GOAL_BODY = { symbol: 'BTCUSDT', targetRate: '0.03', horizonDays: 30, maxLossRate: '0.05' };

let harness: GoalsHarness;

type ErrorBody = {
  error: { code: string; message: string; details?: { field: string; reason: string }[] };
};
type GoalData = {
  id: string;
  symbol: string;
  targetRate: string;
  horizonDays: number;
  maxLossRate: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

beforeAll(async () => {
  harness = await createGoalsHarness({ maxGoals: 6 });
});

afterAll(async () => {
  await harness.stop();
});

async function createGoal(
  subject: string,
  body: Record<string, unknown> = GOAL_BODY,
): Promise<{ status: number; body: unknown }> {
  return readJson(await harness.call({ subject, method: 'POST', path: GOALS, body }));
}

async function createdId(
  subject: string,
  body: Record<string, unknown> = GOAL_BODY,
): Promise<string> {
  const { status, body: created } = await createGoal(subject, body);
  expect(status).toBe(201);
  return (created as { data: GoalData }).data.id;
}

describe('POST /v1/goals', () => {
  test('exige token', async () => {
    expect((await harness.call({ method: 'POST', path: GOALS, body: GOAL_BODY })).status).toBe(401);
  });

  test('cria a meta ativa do dono, com a grafia canônica e sem o dono na resposta', async () => {
    const { status, body } = await createGoal(SUBJECT_A, { ...GOAL_BODY, targetRate: '0.0300' });
    const data = (body as { data: GoalData }).data;
    expect(status).toBe(201);
    expect(data).toMatchObject({
      symbol: 'BTCUSDT',
      targetRate: '0.03',
      horizonDays: 30,
      maxLossRate: '0.05',
      isActive: true,
    });
    expect(Object.keys(data).sort()).toStrictEqual([
      'createdAt',
      'horizonDays',
      'id',
      'isActive',
      'maxLossRate',
      'symbol',
      'targetRate',
      'updatedAt',
    ]);
  });

  test('a resposta bate com o esquema documentado', async () => {
    const route = harness.routes.find(
      (candidate) => candidate.path === GOALS && candidate.method === 'POST',
    );
    const { body } = await createGoal(SUBJECT_A);
    expect(
      route?.documentation?.successes[0]?.schema?.safeParse((body as { data: unknown }).data)
        .success,
    ).toBe(true);
  });

  test('inválida: TODOS os problemas de uma vez, sem eco de valor', async () => {
    const response = await harness.call({
      subject: SUBJECT_A,
      method: 'POST',
      path: GOALS,
      body: { symbol: 'LIXO', targetRate: 'valor-secreto-1', horizonDays: 0, maxLossRate: '1' },
    });
    const text = await response.text();
    const parsed = JSON.parse(text) as ErrorBody;
    expect(response.status).toBe(400);
    expect(parsed.error.code).toBe('REQUEST_VALIDATION_FAILED');
    expect((parsed.error.details ?? []).map((detail) => detail.field).sort()).toStrictEqual([
      'horizonDays',
      'maxLossRate',
      'symbol',
      'targetRate',
    ]);
    expect(text).not.toContain('valor-secreto');
  });

  test('par que a plataforma não habilita é 400 no campo symbol', async () => {
    const { status, body } = await createGoal(SUBJECT_A, { ...GOAL_BODY, symbol: 'DOGEUSDT' });
    expect(status).toBe(400);
    expect((body as ErrorBody).error.details).toStrictEqual([
      { field: 'symbol', reason: 'not_enabled' },
    ]);
  });

  test.each([
    ['campo desconhecido', { ...GOAL_BODY, extra: 1 }],
    ['userId no corpo', { ...GOAL_BODY, userId: '0192f3a1-7c4e-7b2a-9d3f-5e6a7b8c9d12' }],
    ['faltando o prazo', { symbol: 'BTCUSDT', targetRate: '0.03', maxLossRate: '0.05' }],
    ['ganho como número', { ...GOAL_BODY, targetRate: 0.03 }],
  ])('recusa: %s', async (_name, body) => {
    expect((await createGoal(SUBJECT_A, body)).status).toBe(400);
  });

  test('userId no corpo nunca vira dono: a meta é de quem tem o token', async () => {
    const countOf = (subject: string): number =>
      harness.goals.allOf(harness.scopeOf(subject)).length;
    const before = [countOf(SUBJECT_A), countOf(SUBJECT_B)];
    const response = await harness.call({
      subject: SUBJECT_B,
      method: 'POST',
      path: GOALS,
      body: { ...GOAL_BODY, userId: harness.scopeOf(SUBJECT_A).ownerUserId },
    });
    expect(response.status).toBe(400);
    expect([countOf(SUBJECT_A), countOf(SUBJECT_B)]).toStrictEqual(before);
  });

  test('JSON quebrado é 400', async () => {
    const response = await harness.call({
      subject: SUBJECT_A,
      method: 'POST',
      path: GOALS,
      rawBody: '{nao-json',
    });
    expect(response.status).toBe(400);
  });

  test('o teto de metas por usuário é 409 GOAL_LIMIT_REACHED, e é por usuário', async () => {
    const before = harness.goals.allOf(harness.scopeOf(SUBJECT_B)).length;
    for (let created = before; created < 6; created += 1) await createdId(SUBJECT_B);
    const refused = await createGoal(SUBJECT_B);
    expect(refused.status).toBe(409);
    expect((refused.body as ErrorBody).error.code).toBe('GOAL_LIMIT_REACHED');
    expect(harness.goals.allOf(harness.scopeOf(SUBJECT_B))).toHaveLength(6);
    const other = harness.goals.allOf(harness.scopeOf(SUBJECT_A)).length;
    expect(other).toBeLessThan(6);
  });
});

describe('GET /v1/goals', () => {
  test('lista só as metas do dono, das mais novas para as mais antigas, com cursor', async () => {
    await createdId(SUBJECT_A);
    const own = await harness.call({ subject: SUBJECT_A, path: `${GOALS}?limit=2` });
    const first = (await readJson(own)).body as {
      data: GoalData[];
      pagination: { nextCursor: string | null; perPage: number };
    };
    expect(own.status).toBe(200);
    expect(first.data).toHaveLength(2);
    expect(first.pagination.perPage).toBe(2);
    expect(first.pagination.nextCursor).not.toBeNull();
    const ownIds = harness.goals.allOf(harness.scopeOf(SUBJECT_A)).map((goal) => goal.id);
    expect(first.data.every((goal) => ownIds.includes(goal.id))).toBe(true);
    const next = (
      await readJson(
        await harness.call({
          subject: SUBJECT_A,
          path: `${GOALS}?limit=2&cursor=${first.pagination.nextCursor ?? ''}`,
        }),
      )
    ).body as { data: GoalData[] };
    expect(next.data[0]?.id).not.toBe(first.data[0]?.id);
    const times = [...first.data, ...next.data].map((goal) => goal.createdAt);
    expect([...times].sort().reverse()).toStrictEqual(times);
  });

  test('a lista de B não contém meta de A', async () => {
    const listed = (
      await readJson(await harness.call({ subject: SUBJECT_B, path: `${GOALS}?limit=100` }))
    ).body as {
      data: GoalData[];
    };
    const idsOfA = new Set(harness.goals.allOf(harness.scopeOf(SUBJECT_A)).map((goal) => goal.id));
    expect(listed.data.length).toBeGreaterThan(0);
    expect(listed.data.some((goal) => idsOfA.has(goal.id))).toBe(false);
  });

  test('cursor adulterado e limite fora da faixa são 400', async () => {
    expect((await harness.call({ subject: SUBJECT_A, path: `${GOALS}?cursor=lixo` })).status).toBe(
      400,
    );
    expect((await harness.call({ subject: SUBJECT_A, path: `${GOALS}?limit=101` })).status).toBe(
      400,
    );
  });

  test('exige token', async () => {
    expect((await harness.call({ path: GOALS })).status).toBe(401);
  });
});

describe('GET, PATCH e DELETE /v1/goals/:id', () => {
  test('lê, altera parcialmente e apaga a própria meta', async () => {
    const id = await createdId(SUBJECT_A);
    const read = await readJson(await harness.call({ subject: SUBJECT_A, path: `${GOALS}/${id}` }));
    expect(read.status).toBe(200);
    expect((read.body as { data: GoalData }).data).toMatchObject({
      id,
      horizonDays: 30,
      isActive: true,
    });
    const patched = await readJson(
      await harness.call({
        subject: SUBJECT_A,
        method: 'PATCH',
        path: `${GOALS}/${id}`,
        body: { isActive: false, horizonDays: 60 },
      }),
    );
    expect(patched.status).toBe(200);
    expect((patched.body as { data: GoalData }).data).toMatchObject({
      id,
      isActive: false,
      horizonDays: 60,
      targetRate: '0.03',
      symbol: 'BTCUSDT',
    });
    const deleted = await harness.call({
      subject: SUBJECT_A,
      method: 'DELETE',
      path: `${GOALS}/${id}`,
    });
    expect(deleted.status).toBe(204);
    expect(await deleted.text()).toBe('');
    const gone = await harness.call({ subject: SUBJECT_A, path: `${GOALS}/${id}` });
    expect(gone.status).toBe(404);
  });

  test('PATCH devolve a grafia canônica do que veio', async () => {
    const id = await createdId(SUBJECT_A);
    const patched = await readJson(
      await harness.call({
        subject: SUBJECT_A,
        method: 'PATCH',
        path: `${GOALS}/${id}`,
        body: { targetRate: '0.0400', maxLossRate: '0.0500' },
      }),
    );
    expect((patched.body as { data: GoalData }).data).toMatchObject({
      targetRate: '0.04',
      maxLossRate: '0.05',
    });
    await harness.call({ subject: SUBJECT_A, method: 'DELETE', path: `${GOALS}/${id}` });
  });

  test('PATCH sem campo nenhum, vazio ou com campo inválido é 400', async () => {
    const id = await createdId(SUBJECT_A);
    for (const body of [
      {},
      { horizonDays: 0 },
      { targetRate: 'x' },
      { userId: MISSING_ID },
      { isActive: false, userId: MISSING_ID },
      { symbol: 'DOGEUSDT' },
    ]) {
      const response = await harness.call({
        subject: SUBJECT_A,
        method: 'PATCH',
        path: `${GOALS}/${id}`,
        body,
      });
      expect({ body, status: response.status }).toStrictEqual({ body, status: 400 });
    }
    await harness.call({ subject: SUBJECT_A, method: 'DELETE', path: `${GOALS}/${id}` });
  });

  test('PATCH com campo inválido lista só o campo inválido', async () => {
    const id = await createdId(SUBJECT_A);
    const response = await harness.call({
      subject: SUBJECT_A,
      method: 'PATCH',
      path: `${GOALS}/${id}`,
      body: { maxLossRate: '5', horizonDays: 90 },
    });
    expect(
      ((await response.json()) as ErrorBody).error.details?.map((detail) => detail.field),
    ).toStrictEqual(['maxLossRate']);
    await harness.call({ subject: SUBJECT_A, method: 'DELETE', path: `${GOALS}/${id}` });
  });

  test('apagar uma meta que uma execução referencia é 409 GOAL_IN_USE e a meta continua lá', async () => {
    const id = await createdId(SUBJECT_A);
    harness.goals.referenced.add(id);
    const response = await readJson(
      await harness.call({ subject: SUBJECT_A, method: 'DELETE', path: `${GOALS}/${id}` }),
    );
    expect(response.status).toBe(409);
    expect((response.body as ErrorBody).error.code).toBe('GOAL_IN_USE');
    expect((await harness.call({ subject: SUBJECT_A, path: `${GOALS}/${id}` })).status).toBe(200);
    harness.goals.referenced.delete(id);
    await harness.call({ subject: SUBJECT_A, method: 'DELETE', path: `${GOALS}/${id}` });
  });

  test('id malformado ou inexistente é 404, sempre igual', async () => {
    for (const id of ['nao-e-uuid', MISSING_ID.toUpperCase(), MISSING_ID]) {
      for (const method of ['GET', 'PATCH', 'DELETE']) {
        const response = await harness.call({
          subject: SUBJECT_A,
          method,
          path: `${GOALS}/${id}`,
          ...(method === 'PATCH' ? { body: { isActive: false } } : {}),
        });
        expect({ id, method, status: response.status }).toStrictEqual({ id, method, status: 404 });
      }
    }
  });
});

describe('contrato negativo entre usuários: B diante da meta de A', () => {
  const methods = [
    ['GET', (id: string): string => `${GOALS}/${id}`, undefined],
    ['PATCH', (id: string): string => `${GOALS}/${id}`, { isActive: false }],
    ['DELETE', (id: string): string => `${GOALS}/${id}`, undefined],
    ['GET', (id: string): string => `${GOALS}/${id}/evaluation`, undefined],
  ] as const;

  test.each(
    methods.map((entry) => [`${entry[0]} ${entry[1]('<id>').replace('/v1', '')}`, entry] as const),
  )(
    '%s responde ao dono alheio exatamente como a uma meta inexistente',
    async (_name, [method, pathOf, body]) => {
      const id = await createdId(SUBJECT_A);
      const call = (target: string): Promise<Response> =>
        harness.call({
          subject: SUBJECT_B,
          method,
          path: pathOf(target),
          ...(body === undefined ? {} : { body }),
        });
      await expectIndistinguishableNotFound({
        expectedCode: 'GOAL_NOT_FOUND',
        foreignResourceResponse: await call(id),
        missingResourceResponse: await call(MISSING_ID),
      });
      const stillThere = await harness.call({ subject: SUBJECT_A, path: `${GOALS}/${id}` });
      expect(stillThere.status).toBe(200);
      expect(((await stillThere.json()) as { data: GoalData }).data.isActive).toBe(true);
      await harness.call({ subject: SUBJECT_A, method: 'DELETE', path: `${GOALS}/${id}` });
    },
  );
});
