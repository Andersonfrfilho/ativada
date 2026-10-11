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
  USER_A_ID,
  type RunsHarness,
} from './fixtures/api-routes/runs-harness.fixture.js';

const STRATEGIES = '/v1/strategies';

// Cursor bem formado cujo instante o Postgres recusaria (22007): precisa ser 400, nunca 500.
function forgedInstantCursor(): string {
  return Buffer.from(JSON.stringify({ c: 'abc', i: MISSING_ID })).toString('base64url');
}

let harness: RunsHarness;

beforeAll(async () => {
  harness = await createRunsHarness();
});

afterAll(async () => {
  await harness.stop();
});

type StrategyBody = {
  data: {
    strategy: { id: string; name: string; isExample: boolean };
    version: { id: string; version: number; config: Record<string, unknown> };
  };
};
type ErrorBody = {
  error: { code: string; message: string; details?: { field: string; reason: string }[] };
};

function changedConfig(buy: string): unknown {
  const config = structuredClone(CLASSIC_CONFIG) as { thresholds: { buy: string } };
  config.thresholds.buy = buy;
  return config;
}

async function createStrategy(
  subject: string,
  name: string,
  config: unknown = CLASSIC_CONFIG,
): Promise<{ status: number; data: StrategyBody['data'] }> {
  const { status, body } = await readJson(
    await harness.call({ subject, method: 'POST', path: STRATEGIES, body: { name, config } }),
  );
  return { status, data: (body as StrategyBody).data };
}

describe('POST /v1/strategies', () => {
  test('exige token', async () => {
    const response = await harness.call({ method: 'POST', path: STRATEGIES, body: {} });
    expect(response.status).toBe(401);
  });

  test('cria a estratégia e a versão 1 a partir da configuração validada pelo motor', async () => {
    const { status, data } = await createStrategy(SUBJECT_A, '  Placar clássico  ');
    expect(status).toBe(201);
    expect(data.strategy).toMatchObject({ name: 'Placar clássico', isExample: false });
    expect(data.version.version).toBe(1);
    expect(data.version.config).toMatchObject({ schemaVersion: 1, thresholds: { buy: '2' } });
    expect(Object.keys(data.version).sort()).toStrictEqual([
      'config',
      'configHash',
      'createdAt',
      'id',
      'strategyId',
      'version',
    ]);
  });

  test('a versão traz o hash da configuração, igual para a mesma configuração e diferente para outra', async () => {
    const first = await createStrategy(SUBJECT_A, 'Hash 1');
    const same = await createStrategy(SUBJECT_A, 'Hash 2');
    const other = await createStrategy(SUBJECT_A, 'Hash 3', changedConfig('2.5'));
    const hashOf = (created: { data: StrategyBody['data'] }): unknown =>
      (created.data.version as Record<string, unknown>)['configHash'];
    expect(hashOf(first)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashOf(same)).toBe(hashOf(first));
    expect(hashOf(other)).not.toBe(hashOf(first));
  });

  test('a resposta bate com o esquema documentado', async () => {
    const route = harness.routes.find(
      (candidate) => candidate.path === STRATEGIES && candidate.method === 'POST',
    );
    const { data } = await createStrategy(SUBJECT_A, 'Documentada');
    expect(route?.documentation?.successes[0]?.schema?.safeParse(data).success).toBe(true);
  });

  test('configuração inválida: TODOS os problemas de uma vez, junto com o do nome, sem eco de valores', async () => {
    const config = structuredClone(CLASSIC_CONFIG) as Record<string, unknown>;
    config['thresholds'] = { buy: 'valor-secreto-1', sell: 'valor-secreto-2' };
    config['chaveSecreta'] = 'valor-secreto-3';
    const response = await harness.call({
      subject: SUBJECT_A,
      method: 'POST',
      path: STRATEGIES,
      body: { name: '   ', config },
    });
    const text = await response.text();
    const body = JSON.parse(text) as ErrorBody;
    expect(response.status).toBe(400);
    expect(body.error.code).toBe('REQUEST_VALIDATION_FAILED');
    const fields = (body.error.details ?? []).map((detail) => detail.field);
    expect(fields).toContain('name');
    expect(fields).toContain('config.thresholds.buy');
    expect(fields).toContain('config.thresholds.sell');
    expect(fields).toContain('config');
    expect(text).not.toContain('valor-secreto');
    expect(text).not.toContain('chaveSecreta');
  });

  test('corpo sem configuração, não-JSON ou com userId é 400 e nada é criado', async () => {
    const before = (await harness.strategies.repository.listStrategies(harness.scopeOf(SUBJECT_A)))
      .length;
    for (const body of [{ name: 'x' }, { name: 'x', config: CLASSIC_CONFIG, userId: USER_A_ID }]) {
      const response = await harness.call({
        subject: SUBJECT_A,
        method: 'POST',
        path: STRATEGIES,
        body,
      });
      expect(response.status).toBe(400);
    }
    const garbled = await harness.call({
      subject: SUBJECT_A,
      method: 'POST',
      path: STRATEGIES,
      rawBody: '{nao-json',
    });
    expect(garbled.status).toBe(400);
    const after = (await harness.strategies.repository.listStrategies(harness.scopeOf(SUBJECT_A)))
      .length;
    expect(after).toBe(before);
  });

  test('userId no corpo vai para o dono do token, nunca para o do payload', async () => {
    const forged = await harness.call({
      subject: SUBJECT_B,
      method: 'POST',
      path: STRATEGIES,
      body: { name: 'Forjada', config: CLASSIC_CONFIG, userId: USER_A_ID },
    });
    expect(forged.status).toBe(400);
    const owned = await harness.strategies.repository.listStrategies(harness.scopeOf(SUBJECT_A));
    expect(owned.map((strategy) => strategy.name)).not.toContain('Forjada');
  });
});

describe('GET /v1/strategies', () => {
  test('lista as do dono por cursor, das mais novas às mais antigas, com teto de 100', async () => {
    const owner = SUBJECT_B;
    const created: string[] = [];
    for (let index = 0; index < 5; index += 1) {
      created.push((await createStrategy(owner, `Lista ${index}`)).data.strategy.id);
    }
    const first = await readJson(
      await harness.call({ subject: owner, path: `${STRATEGIES}?limit=2` }),
    );
    const firstBody = first.body as {
      data: { id: string }[];
      pagination: { nextCursor: string; perPage: number };
    };
    expect(firstBody.data.map((row) => row.id)).toStrictEqual([created[4] ?? '', created[3] ?? '']);
    expect(firstBody.pagination.perPage).toBe(2);
    const seen = [...firstBody.data.map((row) => row.id)];
    let cursor: string | null = firstBody.pagination.nextCursor;
    while (cursor !== null) {
      const next = await readJson(
        await harness.call({
          subject: owner,
          path: `${STRATEGIES}?limit=2&cursor=${encodeURIComponent(cursor)}`,
        }),
      );
      const nextBody = next.body as {
        data: { id: string }[];
        pagination: { nextCursor: string | null };
      };
      seen.push(...nextBody.data.map((row) => row.id));
      cursor = nextBody.pagination.nextCursor;
    }
    expect(seen).toStrictEqual([...created].reverse());
  });

  test('limit acima de 100, zero, texto e cursor adulterado são 400', async () => {
    for (const query of [
      'limit=101',
      'limit=0',
      'limit=abc',
      'cursor=%%%',
      'cursor=bm90LWpzb24',
      `cursor=${forgedInstantCursor()}`,
      'extra=1',
    ]) {
      const response = await harness.call({ subject: SUBJECT_A, path: `${STRATEGIES}?${query}` });
      expect({ query, status: response.status }).toStrictEqual({ query, status: 400 });
    }
    const atCeiling = await harness.call({ subject: SUBJECT_A, path: `${STRATEGIES}?limit=100` });
    expect(atCeiling.status).toBe(200);
  });

  test('a listagem de B nunca contém ids de A (e vice-versa)', async () => {
    const ofA = await createStrategy(SUBJECT_A, 'Só da A');
    const listB = await readJson(
      await harness.call({ subject: SUBJECT_B, path: `${STRATEGIES}?limit=100` }),
    );
    const idsB = (listB.body as { data: { id: string }[] }).data.map((row) => row.id);
    expect(idsB).not.toContain(ofA.data.strategy.id);
    const listA = await readJson(
      await harness.call({ subject: SUBJECT_A, path: `${STRATEGIES}?limit=100` }),
    );
    expect((listA.body as { data: { id: string }[] }).data.map((row) => row.id)).toContain(
      ofA.data.strategy.id,
    );
  });
});

describe('GET /v1/strategies/:id e /versions', () => {
  test('detalhe traz a versão mais recente; versões vêm da mais nova à mais antiga', async () => {
    const { data } = await createStrategy(SUBJECT_A, 'Com versões');
    const id = data.strategy.id;
    await harness.call({
      subject: SUBJECT_A,
      method: 'POST',
      path: `${STRATEGIES}/${id}/versions`,
      body: { config: changedConfig('3') },
    });
    const detail = await readJson(
      await harness.call({ subject: SUBJECT_A, path: `${STRATEGIES}/${id}` }),
    );
    const detailData = (detail.body as { data: { latestVersion: { version: number } } }).data;
    expect(detail.status).toBe(200);
    expect(detailData.latestVersion.version).toBe(2);
    const versions = await readJson(
      await harness.call({ subject: SUBJECT_A, path: `${STRATEGIES}/${id}/versions?limit=1` }),
    );
    const page = versions.body as {
      data: { version: number }[];
      pagination: { nextCursor: string };
    };
    expect(page.data.map((row) => row.version)).toStrictEqual([2]);
    const second = await readJson(
      await harness.call({
        subject: SUBJECT_A,
        path: `${STRATEGIES}/${id}/versions?limit=1&cursor=${encodeURIComponent(page.pagination.nextCursor)}`,
      }),
    );
    expect(
      (second.body as { data: { version: number }[] }).data.map((row) => row.version),
    ).toStrictEqual([1]);
  });

  test('a resposta do detalhe e a das versões batem com o esquema documentado', async () => {
    const { data } = await createStrategy(SUBJECT_A, 'Documentada 2');
    const id = data.strategy.id;
    const detailRoute = harness.routes.find(
      (r) => r.path === `${STRATEGIES}/:strategyId` && r.method === 'GET',
    );
    const detail = await readJson(
      await harness.call({ subject: SUBJECT_A, path: `${STRATEGIES}/${id}` }),
    );
    expect(
      detailRoute?.documentation?.successes[0]?.schema?.safeParse(
        (detail.body as { data: unknown }).data,
      ).success,
    ).toBe(true);
    const listRoute = harness.routes.find(
      (r) => r.path === `${STRATEGIES}/:strategyId/versions` && r.method === 'GET',
    );
    const versions = await readJson(
      await harness.call({ subject: SUBJECT_A, path: `${STRATEGIES}/${id}/versions` }),
    );
    expect(
      listRoute?.documentation?.successes[0]?.schema?.safeParse(
        (versions.body as { data: unknown }).data,
      ).success,
    ).toBe(true);
  });
});

describe('POST /v1/strategies/:id/versions', () => {
  test('configuração igual devolve a MESMA versão (200); configuração nova cria a próxima (201)', async () => {
    const { data } = await createStrategy(SUBJECT_A, 'Idempotente');
    const path = `${STRATEGIES}/${data.strategy.id}/versions`;
    const same = await readJson(
      await harness.call({
        subject: SUBJECT_A,
        method: 'POST',
        path,
        body: { config: CLASSIC_CONFIG },
      }),
    );
    const sameVersion = (same.body as { data: { version: { id: string; version: number } } }).data
      .version;
    expect(same.status).toBe(200);
    expect(sameVersion).toMatchObject({ id: data.version.id, version: 1 });
    const fresh = await readJson(
      await harness.call({
        subject: SUBJECT_A,
        method: 'POST',
        path,
        body: { config: changedConfig('2.5') },
      }),
    );
    expect(fresh.status).toBe(201);
    expect((fresh.body as { data: { version: { version: number } } }).data.version.version).toBe(2);
    expect(harness.strategies.versionsOf(data.strategy.id)).toHaveLength(2);
    const again = await readJson(
      await harness.call({
        subject: SUBJECT_A,
        method: 'POST',
        path,
        body: { config: changedConfig('2.5') },
      }),
    );
    expect(again.status).toBe(200);
    expect(harness.strategies.versionsOf(data.strategy.id)).toHaveLength(2);
  });

  test('configuração equivalente em outra grafia (decimais, defaults) é a mesma versão', async () => {
    const { data } = await createStrategy(SUBJECT_A, 'Grafias');
    const path = `${STRATEGIES}/${data.strategy.id}/versions`;
    const respelled = structuredClone(CLASSIC_CONFIG) as {
      thresholds: { buy: string };
      risk: { riskPerTrade: string };
    };
    respelled.thresholds.buy = '2.0';
    respelled.risk.riskPerTrade = '0.0100';
    const result = await harness.call({
      subject: SUBJECT_A,
      method: 'POST',
      path,
      body: { config: respelled },
    });
    expect(result.status).toBe(200);
    expect(harness.strategies.versionsOf(data.strategy.id)).toHaveLength(1);
  });

  test('configuração inválida é 400 com todos os problemas', async () => {
    const { data } = await createStrategy(SUBJECT_A, 'Inválida');
    const response = await harness.call({
      subject: SUBJECT_A,
      method: 'POST',
      path: `${STRATEGIES}/${data.strategy.id}/versions`,
      body: { config: { schemaVersion: 1 } },
    });
    const body = (await response.json()) as ErrorBody;
    expect(response.status).toBe(400);
    expect((body.error.details ?? []).length).toBeGreaterThan(1);
  });
});

describe('isolamento entre usuários nas rotas de estratégia (404 idêntico ao inexistente)', () => {
  test('B não lê, não lista versões nem cria versão em estratégia de A', async () => {
    const { data } = await createStrategy(SUBJECT_A, 'Privada de A');
    const id = data.strategy.id;
    const attempts: { name: string; method: string; suffix: string; body?: unknown }[] = [
      { name: 'ler', method: 'GET', suffix: '' },
      { name: 'listar versões', method: 'GET', suffix: '/versions' },
      {
        name: 'criar versão',
        method: 'POST',
        suffix: '/versions',
        body: { config: changedConfig('1.7') },
      },
    ];
    for (const attempt of attempts) {
      const foreign = await harness.call({
        subject: SUBJECT_B,
        method: attempt.method,
        path: `${STRATEGIES}/${id}${attempt.suffix}`,
        body: attempt.body,
      });
      const missing = await harness.call({
        subject: SUBJECT_B,
        method: attempt.method,
        path: `${STRATEGIES}/${MISSING_ID}${attempt.suffix}`,
        body: attempt.body,
      });
      await expectIndistinguishableNotFound({
        expectedCode: 'STRATEGY_NOT_FOUND',
        foreignResourceResponse: foreign,
        missingResourceResponse: missing,
      });
    }
    expect(harness.strategies.versionsOf(id)).toHaveLength(1);
  });

  test('id malformado no caminho é o mesmo 404', async () => {
    const malformed = await harness.call({ subject: SUBJECT_A, path: `${STRATEGIES}/nao-e-uuid` });
    const missing = await harness.call({ subject: SUBJECT_A, path: `${STRATEGIES}/${MISSING_ID}` });
    await expectIndistinguishableNotFound({
      expectedCode: 'STRATEGY_NOT_FOUND',
      foreignResourceResponse: malformed,
      missingResourceResponse: missing,
    });
  });

  test('o dono continua enxergando a própria estratégia depois das tentativas de B', async () => {
    const { data } = await createStrategy(SUBJECT_A, 'Intacta');
    await harness.call({
      subject: SUBJECT_B,
      method: 'POST',
      path: `${STRATEGIES}/${data.strategy.id}/versions`,
      body: { config: changedConfig('1.1') },
    });
    const detail = await harness.call({
      subject: SUBJECT_A,
      path: `${STRATEGIES}/${data.strategy.id}`,
    });
    expect(detail.status).toBe(200);
    expect(harness.strategies.versionsOf(data.strategy.id)).toHaveLength(1);
  });
});
