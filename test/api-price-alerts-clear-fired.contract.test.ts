// Copyright (c) 2026 Ada Technology. All rights reserved.
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';

import {
  MISSING_ID,
  readJson,
  SUBJECT_A,
  SUBJECT_B,
} from './fixtures/api-routes/runs-harness.fixture.js';
import {
  createPriceAlertsHarness,
  type PriceAlertsHarness,
} from './fixtures/api-routes/price-alerts-harness.fixture.js';

const PRICE_ALERTS = '/v1/price-alerts';
const FIRED = `${PRICE_ALERTS}/fired`;

let harness: PriceAlertsHarness;

beforeAll(async () => {
  harness = await createPriceAlertsHarness();
});

afterAll(async () => {
  await harness.stop();
});

async function createAlert(subject: string, value: string): Promise<string> {
  const { body } = await readJson(
    await harness.call({
      subject,
      method: 'POST',
      path: PRICE_ALERTS,
      body: { symbol: 'BTCUSDT', direction: 'above', value, origin: 'manual' },
    }),
  );
  return (body as { data: { id: string } }).data.id;
}

async function listIds(subject: string): Promise<string[]> {
  const { body } = await readJson(
    await harness.call({ subject, path: `${PRICE_ALERTS}?limit=100` }),
  );
  return (body as { data: { id: string }[] }).data.map((row) => row.id);
}

describe('DELETE /v1/price-alerts/fired', () => {
  test('exige token', async () => {
    expect((await harness.call({ method: 'DELETE', path: FIRED })).status).toBe(401);
  });

  test('apaga só os alertas já disparados do dono e diz quantos', async () => {
    const fired = [await createAlert(SUBJECT_A, '100'), await createAlert(SUBJECT_A, '101')];
    const armed = await createAlert(SUBJECT_A, '102');
    for (const id of fired) harness.priceAlerts.markTriggered(id);
    const { status, body } = await readJson(
      await harness.call({ subject: SUBJECT_A, method: 'DELETE', path: FIRED }),
    );
    expect(status).toBe(200);
    expect(body).toStrictEqual({ data: { deleted: 2 } });
    const remaining = await listIds(SUBJECT_A);
    expect(remaining).toContain(armed);
    for (const id of fired) expect(remaining).not.toContain(id);
  });

  test('um alerta desligado à mão (nunca disparou) não é apagado', async () => {
    const id = await createAlert(SUBJECT_A, '200');
    await harness.call({
      subject: SUBJECT_A,
      method: 'PATCH',
      path: `${PRICE_ALERTS}/${id}`,
      body: { isEnabled: false },
    });
    await harness.call({ subject: SUBJECT_A, method: 'DELETE', path: FIRED });
    expect(await listIds(SUBJECT_A)).toContain(id);
  });

  test('repetir não apaga nada e responde 0', async () => {
    const { body } = await readJson(
      await harness.call({ subject: SUBJECT_A, method: 'DELETE', path: FIRED }),
    );
    expect(body).toStrictEqual({ data: { deleted: 0 } });
  });

  test('não mexe nos alertas disparados de outro usuário', async () => {
    const id = await createAlert(SUBJECT_B, '300');
    harness.priceAlerts.markTriggered(id);
    await harness.call({ subject: SUBJECT_A, method: 'DELETE', path: FIRED });
    expect(await listIds(SUBJECT_B)).toContain(id);
    const { body } = await readJson(
      await harness.call({ subject: SUBJECT_B, method: 'DELETE', path: FIRED }),
    );
    expect(body).toStrictEqual({ data: { deleted: 1 } });
  });

  test('"fired" não é confundido com um id: o 404 de id continua igual', async () => {
    const response = await harness.call({
      subject: SUBJECT_A,
      method: 'DELETE',
      path: `${PRICE_ALERTS}/${MISSING_ID}`,
    });
    expect(response.status).toBe(404);
  });

  test('a rota está documentada no OpenAPI', () => {
    const route = harness.routes.find(
      (candidate) => candidate.method === 'DELETE' && candidate.path === FIRED,
    );
    expect(route?.documentation?.summary).toContain('disparados');
    expect(route?.documentation?.successes[0]?.status).toBe(200);
  });
});
