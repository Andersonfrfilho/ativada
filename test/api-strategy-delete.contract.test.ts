// Copyright (c) 2026 Ada Technology. All rights reserved.
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';

import { expectIndistinguishableNotFound } from './fixtures/not-found-response.fixture.js';
import {
  CLASSIC_CONFIG,
  createRunsHarness,
  MISSING_ID,
  readJson,
  SUBJECT_A,
  SUBJECT_B,
  type RunsHarness,
} from './fixtures/api-routes/runs-harness.fixture.js';

const STRATEGIES = '/v1/strategies';

let harness: RunsHarness;

beforeAll(async () => {
  harness = await createRunsHarness();
});

afterAll(async () => {
  await harness.stop();
});

type Listed = { data: { id: string }[] };

async function create(subject: string, name: string): Promise<string> {
  const { body } = await readJson(
    await harness.call({
      subject,
      method: 'POST',
      path: STRATEGIES,
      body: { name, config: CLASSIC_CONFIG },
    }),
  );
  return (body as { data: { strategy: { id: string } } }).data.strategy.id;
}

async function listIds(subject: string): Promise<string[]> {
  const { body } = await readJson(await harness.call({ subject, path: `${STRATEGIES}?limit=100` }));
  return (body as Listed).data.map((row) => row.id);
}

describe('DELETE /v1/strategies/:id', () => {
  test('exige token', async () => {
    expect(
      (await harness.call({ method: 'DELETE', path: `${STRATEGIES}/${MISSING_ID}` })).status,
    ).toBe(401);
  });

  test('apaga a estratégia do dono: 204, some da lista e do detalhe, e as versões também', async () => {
    const id = await create(SUBJECT_A, 'Para apagar');
    const response = await harness.call({
      subject: SUBJECT_A,
      method: 'DELETE',
      path: `${STRATEGIES}/${id}`,
    });
    expect(response.status).toBe(204);
    expect(await listIds(SUBJECT_A)).not.toContain(id);
    for (const path of [`${STRATEGIES}/${id}`, `${STRATEGIES}/${id}/versions`]) {
      expect((await harness.call({ subject: SUBJECT_A, path })).status).toBe(404);
    }
  });

  test('apagar duas vezes: o segundo é 404', async () => {
    const id = await create(SUBJECT_A, 'Duas vezes');
    await harness.call({ subject: SUBJECT_A, method: 'DELETE', path: `${STRATEGIES}/${id}` });
    const again = await harness.call({
      subject: SUBJECT_A,
      method: 'DELETE',
      path: `${STRATEGIES}/${id}`,
    });
    expect(again.status).toBe(404);
  });

  test('B recebe o mesmo 404 do inexistente e a estratégia de A continua lá', async () => {
    const id = await create(SUBJECT_A, 'Protegida');
    const foreign = await harness.call({
      subject: SUBJECT_B,
      method: 'DELETE',
      path: `${STRATEGIES}/${id}`,
    });
    const missing = await harness.call({
      subject: SUBJECT_B,
      method: 'DELETE',
      path: `${STRATEGIES}/${MISSING_ID}`,
    });
    await expectIndistinguishableNotFound({
      expectedCode: 'STRATEGY_NOT_FOUND',
      foreignResourceResponse: foreign,
      missingResourceResponse: missing,
    });
    const malformed = await harness.call({
      subject: SUBJECT_B,
      method: 'DELETE',
      path: `${STRATEGIES}/xyz`,
    });
    expect(malformed.status).toBe(404);
    expect(await listIds(SUBJECT_A)).toContain(id);
  });

  test('a estratégia de exemplo não se apaga: 409 STRATEGY_IS_EXAMPLE, e continua na lista', async () => {
    const scope = harness.scopeOf(SUBJECT_A);
    const created = await harness.strategies.repository.createStrategyWithFirstVersion(scope, {
      name: 'Exemplo',
      isExample: true,
      config: structuredClone(CLASSIC_CONFIG) as never,
      configHash: 'e'.repeat(64),
    });
    const response = await harness.call({
      subject: SUBJECT_A,
      method: 'DELETE',
      path: `${STRATEGIES}/${created.strategy.id}`,
    });
    const { status, body } = await readJson(response);
    expect(status).toBe(409);
    expect((body as { error: { code: string } }).error.code).toBe('STRATEGY_IS_EXAMPLE');
    expect(await listIds(SUBJECT_A)).toContain(created.strategy.id);
  });

  test('a rota está documentada no OpenAPI com o 204 e os erros', () => {
    const route = harness.routes.find(
      (candidate) =>
        candidate.method === 'DELETE' && candidate.path === `${STRATEGIES}/:strategyId`,
    );
    expect(route?.documentation?.successes[0]?.status).toBe(204);
    expect(route?.documentation?.errors.map((error) => error.status)).toContain(409);
  });
});
