// Copyright (c) 2026 Ada Technology. All rights reserved.
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';

import {
  createPriceAlertsHarness,
  type PriceAlertsHarness,
} from './fixtures/api-routes/price-alerts-harness.fixture.js';
import {
  MISSING_ID,
  readJson,
  SUBJECT_A,
  SUBJECT_B,
} from './fixtures/api-routes/runs-harness.fixture.js';
import { expectIndistinguishableNotFound } from './fixtures/not-found-response.fixture.js';

const PATH = '/v1/price-alerts';
const BODY = { symbol: 'BTCUSDT', direction: 'above', value: '70000.50' };

type AlertData = {
  id: string;
  symbol: string;
  direction: string;
  value: string;
  origin: string;
  isEnabled: boolean;
  triggeredAt: string | null;
  createdAt: string;
};
type ErrorBody = {
  error: { code: string; details?: { field: string; reason: string }[] };
};

let harness: PriceAlertsHarness;

beforeAll(async () => {
  harness = await createPriceAlertsHarness({ maxEnabled: 100 });
});

afterAll(async () => {
  await harness.stop();
});

// Cada teste anda dois minutos no relógio injetado: o limite de mutações por minuto é medido nele e os testes não
// consomem a cota uns dos outros.
beforeEach(() => {
  harness.clock.now += 2 * 60_000;
});

async function create(
  subject: string,
  body: Record<string, unknown> = BODY,
): Promise<{ status: number; body: unknown }> {
  return readJson(await harness.call({ subject, method: 'POST', path: PATH, body }));
}

async function createdAlert(
  subject: string,
  body: Record<string, unknown> = BODY,
): Promise<AlertData> {
  const { status, body: created } = await create(subject, body);
  expect(status).toBe(201);
  return (created as { data: AlertData }).data;
}

describe('autenticação', () => {
  test.each([
    ['GET', PATH],
    ['POST', PATH],
    ['GET', `${PATH}/${MISSING_ID}`],
    ['PATCH', `${PATH}/${MISSING_ID}`],
    ['DELETE', `${PATH}/${MISSING_ID}`],
  ])('%s %s exige token', async (method, path) => {
    const response = await harness.call({
      method,
      path,
      body: method === 'GET' ? undefined : BODY,
    });
    expect(response.status).toBe(401);
  });
});

describe('POST /v1/price-alerts', () => {
  test('cria o alerta armado do dono: grafia canônica, origem manual e sem o dono na resposta', async () => {
    const data = await createdAlert(SUBJECT_A);
    expect(data).toMatchObject({
      symbol: 'BTCUSDT',
      direction: 'above',
      value: '70000.5',
      origin: 'manual',
      isEnabled: true,
      triggeredAt: null,
    });
    expect(Object.keys(data).sort()).toStrictEqual([
      'createdAt',
      'direction',
      'id',
      'isEnabled',
      'origin',
      'symbol',
      'triggeredAt',
      'value',
    ]);
  });

  test('"Avisar no plano": a origem `plan` é aceita e guardada', async () => {
    const data = await createdAlert(SUBJECT_A, { ...BODY, origin: 'plan', direction: 'below' });
    expect(data).toMatchObject({ origin: 'plan', direction: 'below' });
  });

  test('a resposta bate com o esquema documentado', async () => {
    const route = harness.routes.find(
      (candidate) => candidate.path === PATH && candidate.method === 'POST',
    );
    const { body } = await create(SUBJECT_A);
    expect(
      route?.documentation?.successes[0]?.schema?.safeParse((body as { data: unknown }).data)
        .success,
    ).toBe(true);
  });

  test('inválido: TODOS os problemas de uma vez, sem eco de valor', async () => {
    const response = await harness.call({
      subject: SUBJECT_A,
      method: 'POST',
      path: PATH,
      body: { symbol: 'LIXO', direction: 'sideways', value: 'valor-secreto-1', origin: 'robot' },
    });
    const text = await response.text();
    const parsed = JSON.parse(text) as ErrorBody;
    expect(response.status).toBe(400);
    expect(parsed.error.code).toBe('REQUEST_VALIDATION_FAILED');
    expect((parsed.error.details ?? []).map((detail) => detail.field).sort()).toStrictEqual([
      'direction',
      'origin',
      'symbol',
      'value',
    ]);
    expect(text).not.toContain('valor-secreto');
  });

  test.each([
    ['valor zero', { ...BODY, value: '0' }],
    ['valor negativo', { ...BODY, value: '-1' }],
    ['valor com 9 casas', { ...BODY, value: '1.123456789' }],
    ['valor em notação científica', { ...BODY, value: '1e5' }],
    ['valor acima do teto', { ...BODY, value: '1000000001' }],
    ['valor como número', { ...BODY, value: 70000 }],
    ['par que a plataforma não habilita', { ...BODY, symbol: 'DOGEUSDT' }],
    ['campo desconhecido', { ...BODY, extra: 1 }],
    ['userId no corpo', { ...BODY, userId: '0192f3a1-7c4e-7b2a-9d3f-5e6a7b8c9d12' }],
    ['faltando a direção', { symbol: 'BTCUSDT', value: '1' }],
  ])('recusa: %s', async (_name, body) => {
    expect((await create(SUBJECT_A, body)).status).toBe(400);
  });

  test('userId no corpo nunca vira dono: o alerta é de quem tem o token', async () => {
    const before = harness.priceAlerts.allOf(harness.scopeOf(SUBJECT_A)).length;
    await create(SUBJECT_B, { ...BODY, userId: '0192f3a1-7c4e-7b2a-9d3f-5e6a7b8c9d11' });
    expect(harness.priceAlerts.allOf(harness.scopeOf(SUBJECT_A)).length).toBe(before);
  });
});

describe('GET /v1/price-alerts', () => {
  test('lista só os do dono, dos mais novos para os mais antigos, por cursor', async () => {
    const first = await createdAlert(SUBJECT_B, { ...BODY, value: '1' });
    const second = await createdAlert(SUBJECT_B, { ...BODY, value: '2' });
    const third = await createdAlert(SUBJECT_B, { ...BODY, value: '3' });
    const page = (
      await readJson(await harness.call({ subject: SUBJECT_B, path: `${PATH}?limit=2` }))
    ).body as {
      data: AlertData[];
      pagination: { nextCursor: string | null };
    };
    expect(page.data.map((row) => row.id)).toStrictEqual([third.id, second.id]);
    const rest = (
      await readJson(
        await harness.call({
          subject: SUBJECT_B,
          path: `${PATH}?limit=2&cursor=${page.pagination.nextCursor}`,
        }),
      )
    ).body as { data: AlertData[] };
    expect(rest.data.map((row) => row.id)).toContain(first.id);
  });

  test('cursor adulterado é 400', async () => {
    expect((await harness.call({ subject: SUBJECT_A, path: `${PATH}?cursor=lixo` })).status).toBe(
      400,
    );
  });
});

describe('PATCH, GET e DELETE do próprio alerta', () => {
  test('o PATCH grava só o que veio', async () => {
    const alert = await createdAlert(SUBJECT_A);
    const { status, body } = await readJson(
      await harness.call({
        subject: SUBJECT_A,
        method: 'PATCH',
        path: `${PATH}/${alert.id}`,
        body: { value: '65000.00', direction: 'below' },
      }),
    );
    expect(status).toBe(200);
    expect((body as { data: AlertData }).data).toMatchObject({
      value: '65000',
      direction: 'below',
      symbol: 'BTCUSDT',
      isEnabled: true,
    });
  });

  test.each([
    ['vazio', {}],
    ['campo desconhecido junto de um válido', { symbol: 'ETHUSDT', isEnabled: false }],
    ['valor inválido', { value: '0' }],
  ])('PATCH %s é 400', async (_name, body) => {
    const alert = await createdAlert(SUBJECT_A);
    const response = await harness.call({
      subject: SUBJECT_A,
      method: 'PATCH',
      path: `${PATH}/${alert.id}`,
      body,
    });
    expect(response.status).toBe(400);
  });

  test('religar um alerta que já disparou o REARMA: liga e limpa o disparo', async () => {
    const alert = await createdAlert(SUBJECT_A);
    harness.priceAlerts.markTriggered(alert.id);
    const fired = (
      await readJson(await harness.call({ subject: SUBJECT_A, path: `${PATH}/${alert.id}` }))
    ).body as { data: AlertData };
    expect(fired.data).toMatchObject({ isEnabled: false });
    expect(fired.data.triggeredAt).not.toBeNull();
    const rearmed = (
      await readJson(
        await harness.call({
          subject: SUBJECT_A,
          method: 'PATCH',
          path: `${PATH}/${alert.id}`,
          body: { isEnabled: true },
        }),
      )
    ).body as { data: AlertData };
    expect(rearmed.data).toMatchObject({ isEnabled: true, triggeredAt: null });
  });

  test('apagar devolve 204 e depois o alerta some', async () => {
    const alert = await createdAlert(SUBJECT_A);
    const deleted = await harness.call({
      subject: SUBJECT_A,
      method: 'DELETE',
      path: `${PATH}/${alert.id}`,
    });
    expect(deleted.status).toBe(204);
    expect((await harness.call({ subject: SUBJECT_A, path: `${PATH}/${alert.id}` })).status).toBe(
      404,
    );
  });
});

describe('teto de alertas ligados por usuário', () => {
  let capped: PriceAlertsHarness;

  beforeAll(async () => {
    capped = await createPriceAlertsHarness({ maxEnabled: 3 });
  });

  afterAll(async () => {
    await capped.stop();
  });

  async function createIn(subject: string): Promise<{ status: number; body: unknown }> {
    return readJson(await capped.call({ subject, method: 'POST', path: PATH, body: BODY }));
  }

  function patch(subject: string, id: string, body: Record<string, unknown>): Promise<Response> {
    return capped.call({ subject, method: 'PATCH', path: `${PATH}/${id}`, body });
  }

  test('acima do teto é 409; desligar um libera; religar acima do teto é 409; o teto é por usuário', async () => {
    const ids: string[] = [];
    for (let index = 0; index < 3; index += 1) {
      const { status, body } = await createIn(SUBJECT_A);
      expect(status).toBe(201);
      ids.push((body as { data: AlertData }).data.id);
    }
    const blocked = await createIn(SUBJECT_A);
    expect(blocked.status).toBe(409);
    expect((blocked.body as ErrorBody).error.code).toBe('PRICE_ALERT_LIMIT_REACHED');
    expect((await createIn(SUBJECT_B)).status).toBe(201);
    const first = ids[0] as string;
    expect((await patch(SUBJECT_A, first, { isEnabled: false })).status).toBe(200);
    expect((await createIn(SUBJECT_A)).status).toBe(201);
    const refused = await readJson(await patch(SUBJECT_A, first, { isEnabled: true }));
    expect(refused.status).toBe(409);
    expect((refused.body as ErrorBody).error.code).toBe('PRICE_ALERT_LIMIT_REACHED');
  });
});

describe('contrato negativo entre usuários', () => {
  test('o alerta de A é, para B, idêntico a um alerta inexistente: ler, alterar e apagar', async () => {
    const alert = await createdAlert(SUBJECT_A);
    const calls: readonly [string, Record<string, unknown> | undefined][] = [
      ['GET', undefined],
      ['PATCH', { isEnabled: false }],
      ['DELETE', undefined],
    ];
    for (const [method, body] of calls) {
      await expectIndistinguishableNotFound({
        expectedCode: 'PRICE_ALERT_NOT_FOUND',
        foreignResourceResponse: await harness.call({
          subject: SUBJECT_B,
          method,
          path: `${PATH}/${alert.id}`,
          body,
        }),
        missingResourceResponse: await harness.call({
          subject: SUBJECT_B,
          method,
          path: `${PATH}/${MISSING_ID}`,
          body,
        }),
      });
    }
  });

  test('id malformado é o mesmo 404', async () => {
    await expectIndistinguishableNotFound({
      expectedCode: 'PRICE_ALERT_NOT_FOUND',
      foreignResourceResponse: await harness.call({
        subject: SUBJECT_B,
        path: `${PATH}/nao-e-uuid`,
      }),
      missingResourceResponse: await harness.call({
        subject: SUBJECT_B,
        path: `${PATH}/${MISSING_ID}`,
      }),
    });
  });

  test('B não lista o alerta de A, e as tentativas de B deixam o alerta de A intacto', async () => {
    const alert = await createdAlert(SUBJECT_A, { ...BODY, value: '12345' });
    await harness.call({ subject: SUBJECT_B, method: 'DELETE', path: `${PATH}/${alert.id}` });
    await harness.call({
      subject: SUBJECT_B,
      method: 'PATCH',
      path: `${PATH}/${alert.id}`,
      body: { isEnabled: false, value: '1' },
    });
    const listed = (
      await readJson(await harness.call({ subject: SUBJECT_B, path: `${PATH}?limit=100` }))
    ).body as {
      data: AlertData[];
    };
    expect(listed.data.some((row) => row.id === alert.id)).toBe(false);
    const own = (
      await readJson(await harness.call({ subject: SUBJECT_A, path: `${PATH}/${alert.id}` }))
    ).body as {
      data: AlertData;
    };
    expect(own.data).toMatchObject({ value: '12345', isEnabled: true });
  });
});

describe('limite de mutações de alertas de preço (10 por minuto por usuário)', () => {
  const MUTATIONS_PER_MINUTE = 10;

  test('a 11ª mutação do minuto é 429 com Retry-After, seja POST, PATCH, DELETE ou a limpeza dos disparados', async () => {
    const alerts: AlertData[] = [];
    for (let created = 0; created < 4; created += 1) alerts.push(await createdAlert(SUBJECT_A));
    for (const alert of alerts.slice(0, 3)) {
      const patched = await harness.call({
        subject: SUBJECT_A,
        method: 'PATCH',
        path: `${PATH}/${alert.id}`,
        body: { value: '71000' },
      });
      expect(patched.status).toBe(200);
    }
    for (const alert of alerts.slice(0, 2)) {
      const deleted = await harness.call({
        subject: SUBJECT_A,
        method: 'DELETE',
        path: `${PATH}/${alert.id}`,
      });
      expect(deleted.status).toBe(204);
    }
    const cleared = await harness.call({
      subject: SUBJECT_A,
      method: 'DELETE',
      path: `${PATH}/fired`,
    });
    expect(cleared.status).toBe(200);
    const target = alerts[3]?.id ?? MISSING_ID;
    const refused = [
      await harness.call({ subject: SUBJECT_A, method: 'POST', path: PATH, body: BODY }),
      await harness.call({
        subject: SUBJECT_A,
        method: 'PATCH',
        path: `${PATH}/${target}`,
        body: { isEnabled: false },
      }),
      await harness.call({ subject: SUBJECT_A, method: 'DELETE', path: `${PATH}/${target}` }),
      await harness.call({ subject: SUBJECT_A, method: 'DELETE', path: `${PATH}/fired` }),
    ];
    expect(refused.map((response) => response.status)).toStrictEqual([429, 429, 429, 429]);
    for (const response of refused) {
      expect(Number(response.headers.get('Retry-After'))).toBeGreaterThan(0);
    }
    expect(alerts.length + 3 + 2 + 1).toBe(MUTATIONS_PER_MINUTE);
  });

  test('ler não gasta o limite, e o limite é de cada usuário', async () => {
    for (let created = 0; created < MUTATIONS_PER_MINUTE; created += 1)
      await createdAlert(SUBJECT_A);
    expect((await create(SUBJECT_A)).status).toBe(429);
    for (let reads = 0; reads < 5; reads += 1) {
      expect((await harness.call({ subject: SUBJECT_A, path: PATH })).status).toBe(200);
    }
    expect((await create(SUBJECT_B)).status).toBe(201);
  });

  test('o rearme em laço (religar, disparar, religar) para no limite em vez de gerar volume sem fim', async () => {
    const alert = await createdAlert(SUBJECT_A);
    const statuses: number[] = [];
    for (let cycle = 0; cycle < 14; cycle += 1) {
      const response = await harness.call({
        subject: SUBJECT_A,
        method: 'PATCH',
        path: `${PATH}/${alert.id}`,
        body: { isEnabled: cycle % 2 === 0 },
      });
      statuses.push(response.status);
    }
    expect(statuses.filter((status) => status === 200)).toHaveLength(MUTATIONS_PER_MINUTE - 1);
    expect(statuses.filter((status) => status === 429)).toHaveLength(
      14 - (MUTATIONS_PER_MINUTE - 1),
    );
  });

  test('um token volta a cada 6 segundos', async () => {
    for (let created = 0; created < MUTATIONS_PER_MINUTE; created += 1)
      await createdAlert(SUBJECT_A);
    expect((await create(SUBJECT_A)).status).toBe(429);
    harness.clock.now += 6_100;
    expect((await create(SUBJECT_A)).status).toBe(201);
    expect((await create(SUBJECT_A)).status).toBe(429);
  });
});

describe('política PRICE_ALERT_MUTATION', () => {
  test('é própria, por usuário, 10 por minuto', () => {
    const policy = harness.app.policies.RATE_LIMIT_POLICY.PRICE_ALERT_MUTATION;
    expect(policy.limit).toBe(10);
    expect(policy.windowMilliseconds).toBe(60_000);
    expect(policy.keyScope).toBe('subject');
  });
});
