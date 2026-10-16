// Copyright (c) 2026 Ada Technology. All rights reserved.
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';

import {
  ANALYST_REQUEST_VERSION,
  ANALYST_REQUIRED_TIMEFRAME,
} from '../apps/api-ativada/src/runs/run-analyst-request.js';
import { ANALYST_RULES, ANALYST_VERSION } from '../packages/risk-analyst/src/analyst.constant.js';
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
const LEAK_MARKER = 'ValorQueNaoPodeVazar';
const GRID = { parameters: [{ path: 'thresholds.buy', values: ['1', '1.5'] }] };

let harness: RunsHarness;
let seeded: SeededStrategy;
let testIndex = 0;

type ErrorBody = { error: { code: string; details?: { field: string; reason: string }[] } };
type RunBody = { data: { id: string } };

beforeAll(async () => {
  harness = await createRunsHarness({
    candles: buildHourlyCandles({ symbol: 'BTCUSDT', count: 48, firstOpenTime: PERIOD_START }),
  });
  seeded = await harness.seedStrategy(SUBJECT_A, 'a');
});

afterAll(async () => {
  await harness.stop();
});

beforeEach(() => {
  for (const run of harness.runs.all()) {
    if (run.status === 'queued' || run.status === 'running') {
      harness.runs.updateRun(run.id, { status: 'cancelled', finishedAt: new Date() });
    }
  }
  testIndex += 1;
  harness.clock.now = Date.UTC(2026, 9, 1) + testIndex * 120_000;
});

function liveBody(overrides: Record<string, unknown>): Record<string, unknown> {
  return {
    strategyVersionId: seeded.versionId,
    kind: 'live_paper',
    symbol: 'BTCUSDT',
    timeframe: '15m',
    ...overrides,
  };
}

async function post(body: unknown): Promise<{ status: number; body: unknown }> {
  return readJson(await harness.call({ subject: SUBJECT_A, method: 'POST', path: RUNS, body }));
}

function detailsOf(body: unknown): readonly { field: string; reason: string }[] {
  return (body as ErrorBody).error.details ?? [];
}

describe('POST /v1/runs com analista de risco (spec 007, T2.2)', () => {
  test('15m em sombra: aceita e guarda { version, mode } no pedido da execução', async () => {
    const { status, body } = await post(liveBody({ analyst: { mode: 'shadow' } }));
    expect(status).toBe(202);
    const run = harness.runs.all().find((candidate) => candidate.id === (body as RunBody).data.id);
    expect(run?.request).toStrictEqual({ analyst: { version: 'analyst-1', mode: 'shadow' } });
  });

  test('convive com piso e dobro no mesmo pedido', async () => {
    const { status, body } = await post(
      liveBody({ analyst: { mode: 'shadow' }, survival: { floorRate: '0.9' } }),
    );
    expect(status).toBe(202);
    const run = harness.runs.all().find((candidate) => candidate.id === (body as RunBody).data.id);
    expect(run?.request).toStrictEqual({
      survival: { floorRate: '0.9', doubleRate: '2' },
      analyst: { version: 'analyst-1', mode: 'shadow' },
    });
  });

  test('1h com analista: 400 com o motivo e nenhuma execução criada', async () => {
    const before = harness.runs.all().length;
    const { status, body } = await post(liveBody({ timeframe: '1h', analyst: { mode: 'shadow' } }));
    expect(status).toBe(400);
    expect(detailsOf(body)).toContainEqual({
      field: 'analyst',
      reason: 'analyst_requires_15m_timeframe',
    });
    expect(harness.runs.all()).toHaveLength(before);
  });

  test.each([
    [
      'backtest',
      { kind: 'backtest', timeframe: '15m', periodStart: PERIOD_START, periodEnd: PERIOD_END },
    ],
    [
      'walk_forward',
      {
        kind: 'walk_forward',
        timeframe: '1d',
        grid: GRID,
        periodStart: PERIOD_START,
        periodEnd: PERIOD_END,
      },
    ],
  ])('%s com analista: 400 not_allowed_for_kind', async (_kind, overrides) => {
    const { status, body } = await post(liveBody({ ...overrides, analyst: { mode: 'shadow' } }));
    expect(status).toBe(400);
    expect(detailsOf(body)).toContainEqual({ field: 'analyst', reason: 'not_allowed_for_kind' });
  });

  test('sem analista nada muda: pedido sem a chave, em 1h e em 15m', async () => {
    for (const timeframe of ['1h', '15m']) {
      const { status, body } = await post(liveBody({ timeframe }));
      expect(status).toBe(202);
      const run = harness.runs
        .all()
        .find((candidate) => candidate.id === (body as RunBody).data.id);
      expect(run?.request ?? null).toBeNull();
      harness.runs.updateRun((body as RunBody).data.id, {
        status: 'cancelled',
        finishedAt: new Date(),
      });
    }
  });

  test('govern é recusado com 400 até a Fase 4 e nada é criado', async () => {
    const before = harness.runs.all().length;
    const { status, body } = await post(liveBody({ analyst: { mode: 'govern' } }));
    expect(status).toBe(400);
    expect(detailsOf(body)).toContainEqual({
      field: 'analyst.mode',
      reason: 'govern_not_available',
    });
    expect(harness.runs.all()).toHaveLength(before);
  });

  test('modo inválido, ausente ou campo desconhecido: 400 sem repetir o valor enviado', async () => {
    const bodies = [
      { mode: LEAK_MARKER },
      {},
      { mode: 'shadow', [LEAK_MARKER]: LEAK_MARKER },
      LEAK_MARKER,
    ];
    for (const analyst of bodies) {
      const { status, body } = await post(liveBody({ analyst }));
      expect(status).toBe(400);
      expect(JSON.stringify(body)).not.toContain(LEAK_MARKER);
      expect(detailsOf(body).length).toBeGreaterThan(0);
    }
  });

  test('os valores do pedido seguem o pacote puro do analista', () => {
    expect(ANALYST_REQUEST_VERSION).toBe(ANALYST_VERSION);
    expect(ANALYST_REQUIRED_TIMEFRAME).toBe(ANALYST_RULES.baseTimeframe);
  });
});
