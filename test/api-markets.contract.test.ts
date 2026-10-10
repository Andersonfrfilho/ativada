// Copyright (c) 2026 Ada Technology. All rights reserved.
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';

import {
  buildHourlyCandles,
  createRunsHarness,
  HOUR,
  readJson,
  SUBJECT_A,
  type RunsHarness,
} from './fixtures/api-routes/runs-harness.fixture.js';

const CANDLES_PATH = '/v1/markets/candles';
const FIRST_OPEN = Date.UTC(2026, 0, 1);
const CANDLE_COUNT = 6_000;

let harness: RunsHarness;

beforeAll(async () => {
  harness = await createRunsHarness({
    candles: [
      ...buildHourlyCandles({ symbol: 'BTCUSDT', count: CANDLE_COUNT, firstOpenTime: FIRST_OPEN }),
      ...buildHourlyCandles({ symbol: 'ETHUSDT', count: 10, firstOpenTime: FIRST_OPEN }),
    ],
  });
});

afterAll(async () => {
  await harness.stop();
});

function candlesPath(query: Record<string, string>): string {
  return `${CANDLES_PATH}?${new URLSearchParams(query).toString()}`;
}

function validQuery(overrides: Record<string, string> = {}): Record<string, string> {
  return {
    symbol: 'BTCUSDT',
    timeframe: '1h',
    from: String(FIRST_OPEN),
    to: String(FIRST_OPEN + 5 * HOUR),
    ...overrides,
  };
}

type ErrorBody = {
  error: { code: string; message: string; details?: { field: string; reason: string }[] };
};

describe('GET /v1/markets/candles', () => {
  test('exige token (access user)', async () => {
    const response = await harness.call({ path: candlesPath(validQuery()) });
    expect(response.status).toBe(401);
  });

  test('devolve os candles de [from, to): from incluído, to excluído, decimais como texto', async () => {
    const { status, body } = await readJson(
      await harness.call({ subject: SUBJECT_A, path: candlesPath(validQuery()) }),
    );
    const data = (body as { data: Record<string, unknown>[] }).data;
    expect(status).toBe(200);
    expect(data).toHaveLength(5);
    expect(data[0]?.['openTime']).toBe(FIRST_OPEN);
    expect(data.at(-1)?.['openTime']).toBe(FIRST_OPEN + 4 * HOUR);
    expect(data[0]).toStrictEqual({
      openTime: FIRST_OPEN,
      closeTime: FIRST_OPEN + HOUR - 1,
      open: '30000.10000000',
      high: '30100.00000000',
      low: '29900.00000000',
      close: '30050.50000000',
      volume: '12.50000000',
      tradeCount: 100,
    });
  });

  test('só traz o par pedido', async () => {
    const { body } = await readJson(
      await harness.call({
        subject: SUBJECT_A,
        path: candlesPath(validQuery({ symbol: 'ETHUSDT' })),
      }),
    );
    expect((body as { data: unknown[] }).data).toHaveLength(5);
  });

  test('símbolo e timeframe fora dos habilitados no ambiente: 400, todos os erros de uma vez, sem eco', async () => {
    const response = await harness.call({
      subject: SUBJECT_A,
      path: candlesPath(validQuery({ symbol: 'DOGEUSDT-secret', timeframe: '2h', from: 'abc' })),
    });
    const text = await response.text();
    const body = JSON.parse(text) as ErrorBody;
    expect(response.status).toBe(400);
    expect(body.error.code).toBe('REQUEST_VALIDATION_FAILED');
    expect(body.error.details?.map((detail) => detail.field).sort()).toStrictEqual([
      'from',
      'symbol',
      'timeframe',
    ]);
    expect(text).not.toContain('DOGEUSDT-secret');
    expect(text).not.toContain('abc');
  });

  test('parâmetro desconhecido, ausente ou repetido é 400', async () => {
    for (const path of [
      candlesPath({ ...validQuery(), userId: 'x' }),
      candlesPath({ symbol: 'BTCUSDT', timeframe: '1h', from: String(FIRST_OPEN) }),
      `${candlesPath(validQuery())}&symbol=ETHUSDT`,
    ]) {
      const response = await harness.call({ subject: SUBJECT_A, path });
      expect({ path, status: response.status }).toStrictEqual({ path, status: 400 });
    }
  });

  test('to precisa ser depois de from', async () => {
    const response = await harness.call({
      subject: SUBJECT_A,
      path: candlesPath(validQuery({ to: String(FIRST_OPEN) })),
    });
    const body = (await response.json()) as ErrorBody;
    expect(response.status).toBe(400);
    expect(body.error.details).toStrictEqual([{ field: 'to', reason: 'must_be_after_from' }]);
  });

  test('o teto é de 5.000 candles por resposta: 5.000 passa, 5.001 é recusado antes do banco', async () => {
    const before = harness.candles.queries.length;
    const exactly = await harness.call({
      subject: SUBJECT_A,
      path: candlesPath(validQuery({ to: String(FIRST_OPEN + 5_000 * HOUR) })),
    });
    const exactlyBody = (await exactly.json()) as { data: unknown[] };
    expect(exactly.status).toBe(200);
    expect(exactlyBody.data).toHaveLength(5_000);
    const tooMany = await harness.call({
      subject: SUBJECT_A,
      path: candlesPath(validQuery({ to: String(FIRST_OPEN + 5_001 * HOUR) })),
    });
    const tooManyBody = (await tooMany.json()) as ErrorBody;
    expect(tooMany.status).toBe(400);
    expect(tooManyBody.error.details).toStrictEqual([{ field: 'to', reason: 'range_too_large' }]);
    expect(harness.candles.queries.length).toBe(before + 1);
  });

  test('intervalo sem candle devolve lista vazia', async () => {
    const { status, body } = await readJson(
      await harness.call({
        subject: SUBJECT_A,
        path: candlesPath(validQuery({ from: '1', to: String(HOUR) })),
      }),
    );
    expect(status).toBe(200);
    expect((body as { data: unknown[] }).data).toStrictEqual([]);
  });

  test('a resposta bate com o esquema documentado', async () => {
    const route = harness.routes.find((candidate) => candidate.path === CANDLES_PATH);
    const schema = route?.documentation?.successes[0]?.schema;
    const { body } = await readJson(
      await harness.call({ subject: SUBJECT_A, path: candlesPath(validQuery()) }),
    );
    expect(schema?.safeParse((body as { data: unknown }).data).success).toBe(true);
  });

  test('limite de 60 consultas por minuto por usuário; a 61ª é 429 com Retry-After', async () => {
    const limited = await createRunsHarness({
      candles: buildHourlyCandles({ symbol: 'BTCUSDT', count: 10, firstOpenTime: FIRST_OPEN }),
    });
    try {
      const policy = limited.app.policies.RATE_LIMIT_POLICY.CANDLE_QUERY;
      expect(policy.limit).toBe(60);
      // O limite geral do usuário (120/min) é maior que o de candles: o de candles é quem corta.
      for (let attempt = 0; attempt < policy.limit; attempt += 1) {
        const response = await limited.call({
          subject: SUBJECT_A,
          path: candlesPath(validQuery()),
        });
        expect(response.status).toBe(200);
      }
      const blocked = await limited.call({ subject: SUBJECT_A, path: candlesPath(validQuery()) });
      expect(blocked.status).toBe(429);
      expect(blocked.headers.get('Retry-After')).not.toBeNull();
    } finally {
      await limited.stop();
    }
  });
});
