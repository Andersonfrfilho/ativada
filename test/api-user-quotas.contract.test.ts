// Copyright (c) 2026 Ada Technology. All rights reserved.
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from 'bun:test';

import {
  createPriceAlertsHarness,
  type PriceAlertsHarness,
} from './fixtures/api-routes/price-alerts-harness.fixture.js';
import {
  CLASSIC_CONFIG,
  createRunsHarness,
  readJson,
  SUBJECT_A,
  SUBJECT_B,
  type RunsHarness,
} from './fixtures/api-routes/runs-harness.fixture.js';

const STRATEGIES = '/v1/strategies';
const ALERTS = '/v1/price-alerts';
const MAX_STRATEGIES = 3;
const MAX_VERSIONS = 3;
const MAX_DISABLED = 2;

type ErrorBody = { error: { code: string } };

function configWithBuy(buy: string): unknown {
  const config = structuredClone(CLASSIC_CONFIG) as { thresholds: { buy: string } };
  config.thresholds.buy = buy;
  return config;
}

describe('teto de estratégias e de versões por usuário', () => {
  let harness: RunsHarness;

  beforeAll(async () => {
    harness = await createRunsHarness({
      strategyLimits: { maxStrategies: MAX_STRATEGIES, maxVersionsPerStrategy: MAX_VERSIONS },
    });
  });
  afterAll(async () => {
    await harness.stop();
  });
  beforeEach(() => {
    harness.clock.now += 2 * 60_000;
  });

  function post(subject: string, path: string, body: unknown): Promise<Response> {
    return harness.call({ subject, method: 'POST', path, body });
  }

  async function codeOf(response: Response): Promise<string> {
    return ((await response.json()) as ErrorBody).error.code;
  }

  test('a estratégia acima do teto é 409 STRATEGY_LIMIT_REACHED; apagar uma libera a vaga; o teto é por usuário', async () => {
    const created: string[] = [];
    for (let index = 0; index < MAX_STRATEGIES; index += 1) {
      const response = await post(SUBJECT_B, STRATEGIES, {
        name: `s${index}`,
        config: CLASSIC_CONFIG,
      });
      expect(response.status).toBe(201);
      const { body } = await readJson(response);
      created.push((body as { data: { strategy: { id: string } } }).data.strategy.id);
    }
    const refused = await post(SUBJECT_B, STRATEGIES, { name: 'a mais', config: CLASSIC_CONFIG });
    expect(refused.status).toBe(409);
    expect(await codeOf(refused)).toBe('STRATEGY_LIMIT_REACHED');
    expect(
      (await post(SUBJECT_A, STRATEGIES, { name: 'de A', config: CLASSIC_CONFIG })).status,
    ).toBe(201);
    const removed = await harness.call({
      subject: SUBJECT_B,
      method: 'DELETE',
      path: `${STRATEGIES}/${created[0]}`,
    });
    expect(removed.status).toBe(204);
    expect(
      (await post(SUBJECT_B, STRATEGIES, { name: 'cabe', config: CLASSIC_CONFIG })).status,
    ).toBe(201);
  });

  test('a versão acima do teto é 409 STRATEGY_VERSION_LIMIT_REACHED; a mesma configuração devolve a existente mesmo no teto', async () => {
    const strategy = await post(SUBJECT_A, STRATEGIES, {
      name: 'versões',
      config: configWithBuy('0.30'),
    });
    const strategyId = ((await strategy.json()) as { data: { strategy: { id: string } } }).data
      .strategy.id;
    const versionsPath = `${STRATEGIES}/${strategyId}/versions`;
    for (const buy of ['0.31', '0.32']) {
      expect((await post(SUBJECT_A, versionsPath, { config: configWithBuy(buy) })).status).toBe(
        201,
      );
    }
    const refused = await post(SUBJECT_A, versionsPath, { config: configWithBuy('0.33') });
    expect(refused.status).toBe(409);
    expect(await codeOf(refused)).toBe('STRATEGY_VERSION_LIMIT_REACHED');
    const same = await post(SUBJECT_A, versionsPath, { config: configWithBuy('0.32') });
    expect(same.status).toBe(200);
  });
});

describe('teto de alertas de preço desligados à mão', () => {
  let harness: PriceAlertsHarness;

  // Um harness por teste: o estado de um (alertas desligados) não pode contar no teto do outro.
  beforeEach(async () => {
    harness = await createPriceAlertsHarness({ maxEnabled: 50, maxDisabled: MAX_DISABLED });
  });
  afterEach(async () => {
    await harness.stop();
  });

  async function newAlert(subject: string): Promise<string> {
    const response = await harness.call({
      subject,
      method: 'POST',
      path: ALERTS,
      body: { symbol: 'BTCUSDT', direction: 'above', value: '70000' },
    });
    return ((await response.json()) as { data: { id: string } }).data.id;
  }

  function patch(subject: string, alertId: string, isEnabled: boolean): Promise<Response> {
    return harness.call({
      subject,
      method: 'PATCH',
      path: `${ALERTS}/${alertId}`,
      body: { isEnabled },
    });
  }

  test('desligar acima do teto é 409 PRICE_ALERT_DISABLED_LIMIT_REACHED; religar ou apagar libera; o teto é por usuário', async () => {
    const [first, second, third] = [
      await newAlert(SUBJECT_A),
      await newAlert(SUBJECT_A),
      await newAlert(SUBJECT_A),
    ];
    expect((await patch(SUBJECT_A, first, false)).status).toBe(200);
    expect((await patch(SUBJECT_A, second, false)).status).toBe(200);
    const refused = await patch(SUBJECT_A, third, false);
    expect(refused.status).toBe(409);
    expect(((await refused.json()) as ErrorBody).error.code).toBe(
      'PRICE_ALERT_DISABLED_LIMIT_REACHED',
    );
    expect((await patch(SUBJECT_A, first, true)).status).toBe(200);
    expect((await patch(SUBJECT_A, third, false)).status).toBe(200);
    await harness.call({ subject: SUBJECT_A, method: 'DELETE', path: `${ALERTS}/${second}` });
    expect((await patch(SUBJECT_A, first, false)).status).toBe(200);
    const ofB = await newAlert(SUBJECT_B);
    expect((await patch(SUBJECT_B, ofB, false)).status).toBe(200);
  });

  test('desligar um alerta que JÁ está desligado não conta de novo, e o disparado não entra na conta', async () => {
    const a = await newAlert(SUBJECT_A);
    const b = await newAlert(SUBJECT_A);
    const fired = await newAlert(SUBJECT_A);
    harness.priceAlerts.markTriggered(fired);
    expect((await patch(SUBJECT_A, a, false)).status).toBe(200);
    expect((await patch(SUBJECT_A, a, false)).status).toBe(200);
    expect((await patch(SUBJECT_A, b, false)).status).toBe(200);
  });
});
