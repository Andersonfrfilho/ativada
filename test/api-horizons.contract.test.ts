// Copyright (c) 2026 Ada Technology. All rights reserved.
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  setDefaultTimeout,
  test,
} from 'bun:test';

import { expectIndistinguishableNotFound } from './fixtures/not-found-response.fixture.js';
import {
  createHorizonsHarness,
  type HorizonsHarness,
} from './fixtures/api-routes/horizons-harness.fixture.js';
import { readJson, SUBJECT_A, SUBJECT_B } from './fixtures/api-routes/runs-harness.fixture.js';

// Cada avaliação a frio roda o motor de verdade sobre dado real (400 diários e 2.000 de 15 min).
setDefaultTimeout(120_000);

const HORIZONS = '/v1/horizons';
const MINUTE = 60_000;
const DECIMAL = /^-?\d+(\.\d+)?$/;

type Row = {
  kind: 'intraday' | 'daily';
  strategy: { id: string; name: string; versionId: string; version: number };
  message: string;
  horizonDays?: number;
  isRecommended?: boolean;
  median?: string | null;
  positiveRate?: string | null;
  worstDecile?: string | null;
  windowCount?: number;
  verdict?: string;
  netReturn?: string | null;
  feesPaid?: string;
  tradeCount?: number;
};
type HorizonsBody = {
  data: {
    symbol: string;
    evaluatedStrategies: number;
    isStrategyListTruncated: boolean;
    rows: Row[];
    recommendedHorizonDays: number | null;
    recommendationMessage: string;
    unavailable: { strategyId: string; reason: string }[];
  };
};
type ErrorBody = {
  error: { code: string; message: string; details?: { field: string; reason: string }[] };
};

let harness: HorizonsHarness;
let mineStrategyId: string;
let otherStrategyId: string;

beforeAll(async () => {
  harness = await createHorizonsHarness();
  mineStrategyId = (await harness.seedStrategy(SUBJECT_A, 'principal')).strategyId;
  otherStrategyId = (await harness.seedStrategy(SUBJECT_B, 'de-b')).strategyId;
});

afterAll(async () => {
  await harness.stop();
});

// Cada teste anda dois minutos no relógio injetado: os limites por minuto são medidos nele e os testes não consomem a
// cota uns dos outros.
beforeEach(() => {
  harness.clock.now += 2 * MINUTE;
});

function get(query: string, options: { subject?: string | null } = {}): Promise<Response> {
  const subject = options.subject === undefined ? SUBJECT_A : (options.subject ?? undefined);
  return harness.call({ subject, path: `${HORIZONS}${query}` });
}

async function ok(query: string): Promise<HorizonsBody['data']> {
  const response = await get(query);
  expect(response.status).toBe(200);
  return ((await response.json()) as HorizonsBody).data;
}

describe('GET /v1/horizons', () => {
  test('exige token', async () => {
    expect((await get('?symbol=BTCUSDT', { subject: null })).status).toBe(401);
  });

  test('par desabilitado, ausente ou repetido é 400 sem eco do valor, e nada é calculado', async () => {
    const before = harness.computations.count;
    for (const query of ['?symbol=DOGEUSDT', '', '?symbol=BTCUSDT&symbol=ETHUSDT', '?symbol=']) {
      const response = await get(query);
      const text = await response.text();
      expect(response.status).toBe(400);
      expect(JSON.parse(text) as ErrorBody).toMatchObject({
        error: { code: 'REQUEST_VALIDATION_FAILED' },
      });
      expect(text).not.toContain('DOGEUSDT');
    }
    const disabled = (await (await get('?symbol=DOGEUSDT')).json()) as ErrorBody;
    expect(disabled.error.details).toStrictEqual([{ field: 'symbol', reason: 'not_enabled' }]);
    expect(harness.computations.count).toBe(before);
  });

  test('parâmetro desconhecido é 400', async () => {
    const response = await get('?symbol=BTCUSDT&limit=5');
    expect(response.status).toBe(400);
  });

  test('estratégia de outro usuário, id inexistente e id malformado são o MESMO 404', async () => {
    const missing = '0192f3a1-7c4e-7b2a-9d3f-5e6a7b8c9dff';
    const foreign = await get(`?symbol=BTCUSDT&strategyId=${otherStrategyId}`);
    await expectIndistinguishableNotFound({
      expectedCode: 'STRATEGY_NOT_FOUND',
      foreignResourceResponse: foreign,
      missingResourceResponse: await get(`?symbol=BTCUSDT&strategyId=${missing}`),
    });
    await expectIndistinguishableNotFound({
      expectedCode: 'STRATEGY_NOT_FOUND',
      foreignResourceResponse: await get(`?symbol=BTCUSDT&strategyId=${otherStrategyId}`),
      missingResourceResponse: await get('?symbol=BTCUSDT&strategyId=nao-e-um-id'),
    });
    expect((await get(`?symbol=BTCUSDT&strategyId=${otherStrategyId.toUpperCase()}`)).status).toBe(
      404,
    );
  });

  test('a resposta traz a linha de 15 minutos e as de 7, 15 e 30 dias, nessa ordem, cada uma com frase', async () => {
    const data = await ok('?symbol=BTCUSDT');
    expect(data.symbol).toBe('BTCUSDT');
    expect(data.evaluatedStrategies).toBe(1);
    expect(data.rows.map((row) => [row.kind, row.horizonDays])).toStrictEqual([
      ['intraday', undefined],
      ['daily', 7],
      ['daily', 15],
      ['daily', 30],
    ]);
    expect(data.rows.every((row) => row.strategy.id === mineStrategyId)).toBe(true);
    expect(data.rows.every((row) => row.message.length > 0)).toBe(true);
    const intraday = data.rows[0];
    expect(intraday?.message).toStartWith('Operar de 15 em 15 minutos:');
    expect(['COMPENSA', 'NAO_COMPENSA']).toContain(intraday?.verdict as string);
    expect(intraday?.feesPaid).toMatch(DECIMAL);
    for (const row of data.rows.slice(1)) {
      expect(row.message).toStartWith(`Por ${row.horizonDays} dias:`);
      expect(row.windowCount).toBeGreaterThan(0);
      for (const value of [row.median, row.positiveRate, row.worstDecile]) {
        expect(value).toMatch(DECIMAL);
      }
    }
  });

  test('no máximo uma linha de dias recebe o selo, e é a do prazo recomendado; a de 15 minutos nunca', async () => {
    const data = await ok('?symbol=BTCUSDT');
    const stamped = data.rows.filter((row) => row.isRecommended === true);
    expect(stamped.length).toBeLessThanOrEqual(1);
    expect(stamped.map((row) => row.horizonDays)).toStrictEqual(
      data.recommendedHorizonDays === null ? [] : [data.recommendedHorizonDays],
    );
    expect(data.rows.find((row) => row.kind === 'intraday')).not.toHaveProperty('isRecommended');
    if (data.recommendedHorizonDays === null) {
      expect(data.recommendationMessage).toBe('Nenhum prazo compensou no histórico desta moeda.');
    } else {
      expect(data.recommendationMessage).toContain(`${data.recommendedHorizonDays} dias`);
    }
  });

  test('com strategyId do dono vale só aquela; a frase nunca ecoa o valor recebido', async () => {
    const response = await get(`?symbol=ETHUSDT&strategyId=${mineStrategyId}`);
    const text = await response.text();
    expect(response.status).toBe(200);
    expect((JSON.parse(text) as HorizonsBody).data.evaluatedStrategies).toBe(1);
  });

  test('a segunda chamada vem do cache; a 21ª no minuto é 429 e o outro usuário não é afetado', async () => {
    await ok('?symbol=SOLUSDT');
    const computed = harness.computations.count;
    const statuses: number[] = [];
    for (let call = 1; call < 20; call += 1) statuses.push((await get('?symbol=SOLUSDT')).status);
    expect(statuses.every((status) => status === 200)).toBe(true);
    expect(harness.computations.count).toBe(computed);
    expect((await get('?symbol=SOLUSDT')).status).toBe(429);
    expect((await get('?symbol=SOLUSDT', { subject: SUBJECT_B })).status).toBe(200);
  });

  test('a quarta moeda a frio no minuto é 429 com Retry-After, pelo mesmo orçamento das metas', async () => {
    const fresh = await createHorizonsHarness();
    try {
      await fresh.seedStrategy(SUBJECT_A, 'principal');
      const statuses: number[] = [];
      let last: Response | undefined;
      for (const symbol of ['BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'SOLUSDT']) {
        last = await fresh.call({ subject: SUBJECT_A, path: `${HORIZONS}?symbol=${symbol}` });
        statuses.push(last.status);
      }
      expect(statuses).toStrictEqual([200, 200, 200, 429]);
      expect(Number(last?.headers.get('Retry-After'))).toBeGreaterThan(0);
      expect(((await readJson(last as Response)).body as ErrorBody).error.code).toBe(
        'RATE_LIMITED',
      );
    } finally {
      await fresh.stop();
    }
  });
});
