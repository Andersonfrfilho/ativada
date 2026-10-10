// Copyright (c) 2026 Ada Technology. All rights reserved.
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';

import {
  buildHourlyCandles,
  createRunsHarness,
  MISSING_ID,
  readJson,
  SUBJECT_A,
  SUBJECT_B,
  USER_A_ID,
  USER_B_ID,
  type RunsHarness,
  type SeededStrategy,
} from './fixtures/api-routes/runs-harness.fixture.js';
import { expectIndistinguishableNotFound } from './fixtures/not-found-response.fixture.js';

const RUNS = '/v1/runs';
const PERIOD_START = Date.UTC(2024, 0, 1);
const PERIOD_END = Date.UTC(2026, 0, 1);
const QUEUE_LIMIT = 3;
const GRID = { parameters: [{ path: 'thresholds.buy', values: ['1', '1.5', '2'] }] };

let harness: RunsHarness;
let seededA: SeededStrategy;
let seededB: SeededStrategy;
let testIndex = 0;

type ErrorBody = { error: { code: string; message: string } };
type RunBody = {
  data: {
    id: string;
    status: string;
    queuePosition: { own: number; overall: number } | null;
  };
};

beforeAll(async () => {
  harness = await createRunsHarness({
    queuePerUserLimit: QUEUE_LIMIT,
    candles: buildHourlyCandles({ symbol: 'BTCUSDT', count: 48, firstOpenTime: PERIOD_START }),
  });
  seededA = await harness.seedStrategy(SUBJECT_A, 'a');
  seededB = await harness.seedStrategy(SUBJECT_B, 'b');
});

afterAll(async () => {
  await harness.stop();
});

beforeEach(() => {
  testIndex += 1;
  harness.clock.now = Date.UTC(2026, 9, 1) + testIndex * 120_000;
  harness.dispatched.length = 0;
  for (const run of harness.runs.all()) {
    if (run.status === 'queued' || run.status === 'running') {
      harness.runs.updateRun(run.id, { status: 'cancelled', finishedAt: new Date() });
    }
  }
  harness.limits.clear();
});

function body(
  seeded: SeededStrategy,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
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

async function post(
  subject: string,
  seeded: SeededStrategy,
  overrides: Record<string, unknown> = {},
): Promise<{ status: number; body: unknown }> {
  return readJson(
    await harness.call({ subject, method: 'POST', path: RUNS, body: body(seeded, overrides) }),
  );
}

async function fill(subject: string, seeded: SeededStrategy, count: number): Promise<string[]> {
  const ids: string[] = [];
  for (let index = 0; index < count; index += 1) {
    harness.clock.now += 4_000;
    const created = await post(subject, seeded);
    expect(created.status).toBe(202);
    ids.push((created.body as RunBody).data.id);
  }
  return ids;
}

describe('POST /v1/runs: fila por usuário limitada (RUN_QUEUE_FULL)', () => {
  test('o estouro responde 429 RUN_QUEUE_FULL, não cria nem despacha nada', async () => {
    await fill(SUBJECT_A, seededA, QUEUE_LIMIT);
    const before = harness.runs.all().length;
    const dispatchedBefore = harness.dispatched.length;
    harness.clock.now += 4_000;
    const refused = await post(SUBJECT_A, seededA);
    expect(refused.status).toBe(429);
    expect((refused.body as ErrorBody).error.code).toBe('RUN_QUEUE_FULL');
    expect(harness.runs.all()).toHaveLength(before);
    expect(harness.dispatched).toHaveLength(dispatchedBefore);
  });

  test('vale por usuário: a fila cheia de A não impede B', async () => {
    await fill(SUBJECT_A, seededA, QUEUE_LIMIT);
    harness.clock.now += 4_000;
    expect((await post(SUBJECT_B, seededB)).status).toBe(202);
  });

  test('conta só a fila: a execução que começou a rodar libera a vaga', async () => {
    const [first] = await fill(SUBJECT_A, seededA, QUEUE_LIMIT);
    harness.runs.updateRun(first ?? '', { status: 'running' });
    harness.clock.now += 4_000;
    expect((await post(SUBJECT_A, seededA)).status).toBe(202);
  });

  test('cancelar uma queued a REMOVE da fila e devolve a vaga', async () => {
    const [first] = await fill(SUBJECT_A, seededA, QUEUE_LIMIT);
    harness.clock.now += 4_000;
    expect((await post(SUBJECT_A, seededA)).status).toBe(429);
    const stopped = await harness.call({
      subject: SUBJECT_A,
      method: 'POST',
      path: `${RUNS}/${first}/stop`,
    });
    expect(stopped.status).toBe(200);
    harness.clock.now += 4_000;
    expect((await post(SUBJECT_A, seededA)).status).toBe(202);
  });

  test('walk-forward entra na mesma fila do usuário', async () => {
    await fill(SUBJECT_A, seededA, QUEUE_LIMIT - 1);
    harness.clock.now += 4_000;
    const walkForward = await post(SUBJECT_A, seededA, {
      kind: 'walk_forward',
      timeframe: '1d',
      grid: GRID,
    });
    expect(walkForward.status).toBe(202);
    harness.clock.now += 4_000;
    expect((await post(SUBJECT_A, seededA)).status).toBe(429);
  });
});

describe('POST /v1/runs: simulação ao vivo acima do teto (LIVE_RUN_LIMIT_REACHED)', () => {
  async function seedLiveRuns(
    subject: string,
    seeded: SeededStrategy,
    count: number,
  ): Promise<void> {
    for (let index = 0; index < count; index += 1) {
      await harness.runs.repository.createRun(harness.scopeOf(subject), {
        strategyVersionId: seeded.versionId,
        kind: 'live_paper',
        symbol: 'BTCUSDT',
        timeframe: '1h',
        runParameters: { symbol: 'BTCUSDT' },
        runHash: '0'.repeat(64),
        engineVersion: 'engine-2',
        signalEngineVersion: 'signal-2',
        metricsVersion: 'metrics-1',
        periodStart: PERIOD_START,
        periodEnd: undefined,
        migratedFromRunId: undefined,
      });
    }
  }

  test('abaixo do teto (padrão 5) a rota continua 501 até a Fase 4', async () => {
    await seedLiveRuns(SUBJECT_A, seededA, 4);
    const response = await post(SUBJECT_A, seededA, { kind: 'live_paper' });
    expect(response.status).toBe(501);
    expect((response.body as ErrorBody).error.code).toBe('LIVE_RUNS_NOT_AVAILABLE');
  });

  test('no teto (5 ativas) responde 409 LIVE_RUN_LIMIT_REACHED', async () => {
    await seedLiveRuns(SUBJECT_A, seededA, 5);
    const response = await post(SUBJECT_A, seededA, { kind: 'live_paper' });
    expect(response.status).toBe(409);
    expect((response.body as ErrorBody).error.code).toBe('LIVE_RUN_LIMIT_REACHED');
  });

  test('o teto vem de users.limits do dono, e o outro usuário não é afetado', async () => {
    harness.limits.set(USER_A_ID, { maxActiveLivePaperRuns: 2 });
    await seedLiveRuns(SUBJECT_A, seededA, 2);
    expect((await post(SUBJECT_A, seededA, { kind: 'live_paper' })).status).toBe(409);
    expect((await post(SUBJECT_B, seededB, { kind: 'live_paper' })).status).toBe(501);
    harness.limits.set(USER_A_ID, { maxActiveLivePaperRuns: 'muitas' });
    expect((await post(SUBJECT_A, seededA, { kind: 'live_paper' })).status).toBe(501);
  });

  test('só as ATIVAS contam: a encerrada libera a vaga', async () => {
    harness.limits.set(USER_A_ID, { maxActiveLivePaperRuns: 1 });
    await seedLiveRuns(SUBJECT_A, seededA, 1);
    const [live] = harness.runs
      .all()
      .filter((run) => run.kind === 'live_paper' && run.status === 'queued');
    harness.runs.updateRun(live?.id ?? '', { status: 'completed', finishedAt: new Date() });
    expect((await post(SUBJECT_A, seededA, { kind: 'live_paper' })).status).toBe(501);
  });

  test('a simulação ao vivo não consome a fila de backtests', async () => {
    await seedLiveRuns(SUBJECT_A, seededA, 4);
    await fill(SUBJECT_A, seededA, QUEUE_LIMIT);
  });
});

describe('GET /v1/runs/:id: posição na fila', () => {
  test('queued traz a posição entre as execuções do dono e a global como número', async () => {
    const [a1, a2] = await fill(SUBJECT_A, seededA, 2);
    const [b1] = await fill(SUBJECT_B, seededB, 1);
    const read = async (subject: string, runId: string | undefined): Promise<RunBody> =>
      (await readJson(await harness.call({ subject, path: `${RUNS}/${runId}` }))).body as RunBody;
    const positions = await Promise.all([
      read(SUBJECT_A, a1),
      read(SUBJECT_A, a2),
      read(SUBJECT_B, b1),
    ]);
    expect(positions.map((entry) => entry.data.queuePosition)).toStrictEqual([
      { own: 1, overall: 1 },
      { own: 2, overall: 2 },
      { own: 1, overall: 3 },
    ]);
  });

  test('a resposta de criação já traz a posição', async () => {
    await fill(SUBJECT_B, seededB, 1);
    harness.clock.now += 4_000;
    const created = (await post(SUBJECT_A, seededA)).body as RunBody;
    expect(created.data.queuePosition).toStrictEqual({ own: 1, overall: 2 });
  });

  test('quem não está na fila (running ou final) tem queuePosition null', async () => {
    const [first] = await fill(SUBJECT_A, seededA, 1);
    harness.runs.updateRun(first ?? '', { status: 'running' });
    const response = await readJson(
      await harness.call({ subject: SUBJECT_A, path: `${RUNS}/${first}` }),
    );
    expect((response.body as RunBody).data.queuePosition).toBeNull();
  });

  test('a posição de A não vaza para B: execução alheia continua 404 idêntico ao inexistente', async () => {
    const [a1] = await fill(SUBJECT_A, seededA, 1);
    await expectIndistinguishableNotFound({
      expectedCode: 'RUN_NOT_FOUND',
      foreignResourceResponse: await harness.call({ subject: SUBJECT_B, path: `${RUNS}/${a1}` }),
      missingResourceResponse: await harness.call({
        subject: SUBJECT_B,
        path: `${RUNS}/${MISSING_ID}`,
      }),
    });
    const own = await fill(SUBJECT_B, seededB, 1);
    const response = await readJson(
      await harness.call({ subject: SUBJECT_B, path: `${RUNS}/${own[0]}` }),
    );
    const text = JSON.stringify(response.body);
    for (const foreign of [USER_A_ID, a1 ?? '']) expect(text).not.toContain(foreign);
    expect(text).not.toContain(USER_B_ID);
  });
});
