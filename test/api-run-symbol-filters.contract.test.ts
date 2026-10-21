// Copyright (c) 2026 Ada Technology. All rights reserved.
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';

import {
  buildHourlyCandles,
  createRunsHarness,
  readJson,
  SUBJECT_A,
  type RunsHarness,
  type SeededStrategy,
} from './fixtures/api-routes/runs-harness.fixture.js';

const RUNS = '/v1/runs';
const PERIOD_START = Date.UTC(2024, 0, 1);
const PERIOD_END = Date.UTC(2026, 0, 1);
const UNKNOWN_SYMBOL = 'FOOUSDT';
// Calculados com o código ANTES de a tabela existir: BTC e ETH não passam por ela, então o hash tem de continuar este.
const GOLDEN_RUN_HASH = {
  BTCUSDT: 'da96318e37bca44a9ec657c3bf58cd09ba487137299cec7ed5bc12926657b079',
  ETHUSDT: '61a883915c5cb6b824680e868ec4cb32a1e3f95ec00c2bdcc8b821a4f2254062',
} as const;

let harness: RunsHarness;
let seeded: SeededStrategy;
let testIndex = 0;

type ErrorBody = {
  error: { code: string; details?: { field: string; reason: string }[] };
};

beforeAll(async () => {
  harness = await createRunsHarness({
    symbols: ['BTCUSDT', 'ETHUSDT', 'PEPEUSDT', UNKNOWN_SYMBOL],
    candles: buildHourlyCandles({ symbol: 'BTCUSDT', count: 48, firstOpenTime: PERIOD_START }),
  });
  seeded = await harness.seedStrategy(SUBJECT_A, 'a');
});

afterAll(async () => {
  await harness.stop();
});

beforeEach(() => {
  testIndex += 1;
  harness.clock.now = Date.UTC(2026, 9, 1) + testIndex * 120_000;
});

function backtestBody(overrides: Record<string, unknown>): Record<string, unknown> {
  return {
    strategyVersionId: seeded.versionId,
    kind: 'backtest',
    symbol: 'BTCUSDT',
    timeframe: '1h',
    periodStart: PERIOD_START,
    periodEnd: PERIOD_END,
    ...overrides,
  };
}

async function createRun(overrides: Record<string, unknown>): Promise<{
  status: number;
  body: unknown;
}> {
  const response = await harness.call({
    subject: SUBJECT_A,
    method: 'POST',
    path: RUNS,
    body: backtestBody(overrides),
  });
  return readJson(response);
}

function storedRun(body: unknown): { runParameters: unknown; runHash: string } {
  const id = (body as { data: { id: string } }).data.id;
  const stored = harness.runs.all().find((run) => run.id === id);
  if (stored === undefined) throw new Error('execução não gravada');
  return { runParameters: stored.runParameters, runHash: stored.runHash };
}

describe('POST /v1/runs: filtros de preço e quantidade por par', () => {
  test('PEPEUSDT grava o tick e o passo da tabela', async () => {
    const { status, body } = await createRun({ symbol: 'PEPEUSDT' });
    expect(status).toBe(202);
    expect(storedRun(body).runParameters).toMatchObject({
      tickSize: '0.00000001',
      quantityStep: '1',
    });
  });

  test.each(Object.entries(GOLDEN_RUN_HASH))(
    '%s fica fora da tabela: o runHash é o dourado de antes dela',
    async (symbol, expectedHash) => {
      const { status, body } = await createRun({ symbol });
      expect(status).toBe(202);
      const stored = storedRun(body);
      expect(stored.runHash).toBe(expectedHash);
      expect(stored.runParameters).toMatchObject({ tickSize: '0.01', quantityStep: '0.00001' });
    },
  );

  test('o tickSize enviado pelo usuário vence a tabela', async () => {
    const { status, body } = await createRun({
      symbol: 'PEPEUSDT',
      runParameters: { tickSize: '0.0000001' },
    });
    expect(status).toBe(202);
    expect(storedRun(body).runParameters).toMatchObject({
      tickSize: '0.0000001',
      quantityStep: '1',
    });
  });

  test('par habilitado sem filtro conhecido é 400 em symbol, sem eco do valor', async () => {
    const response = await harness.call({
      subject: SUBJECT_A,
      method: 'POST',
      path: RUNS,
      body: backtestBody({ symbol: UNKNOWN_SYMBOL }),
    });
    const text = await response.text();
    const body = JSON.parse(text) as ErrorBody;
    expect(response.status).toBe(400);
    expect(body.error.details).toStrictEqual([{ field: 'symbol', reason: 'not_enabled' }]);
    expect(text).not.toContain(UNKNOWN_SYMBOL);
  });
});
