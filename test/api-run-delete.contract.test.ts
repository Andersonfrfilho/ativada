// Copyright (c) 2026 Ada Technology. All rights reserved.
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';

import {
  buildHourlyCandles,
  createRunsHarness,
  MISSING_ID,
  readJson,
  SUBJECT_A,
  SUBJECT_B,
  type RunsHarness,
  type SeededStrategy,
} from './fixtures/api-routes/runs-harness.fixture.js';
import { expectIndistinguishableNotFound } from './fixtures/not-found-response.fixture.js';

const RUNS = '/v1/runs';
const PERIOD_START = Date.UTC(2024, 0, 1);
const PERIOD_END = Date.UTC(2026, 0, 1);
const STORAGE_LIMIT = 3;

let harness: RunsHarness;
let seededA: SeededStrategy;
let seededB: SeededStrategy;
let testIndex = 0;

beforeAll(async () => {
  harness = await createRunsHarness({
    candles: buildHourlyCandles({ symbol: 'BTCUSDT', count: 48, firstOpenTime: PERIOD_START }),
    runStorageLimit: STORAGE_LIMIT,
  });
  seededA = await harness.seedStrategy(SUBJECT_A, 'a');
  seededB = await harness.seedStrategy(SUBJECT_B, 'b');
});

afterAll(async () => {
  await harness.stop();
});

beforeEach(() => {
  // O que um teste guardou não pode contar no teto do seguinte: apaga-se tudo o que está terminado.
  for (const run of harness.runs.all()) {
    if (run.status === 'queued' || run.status === 'running') {
      harness.runs.updateRun(run.id, { status: 'cancelled', finishedAt: new Date() });
    }
  }
  harness.runs.purgeAll();
  testIndex += 1;
  harness.clock.now = Date.UTC(2026, 9, 1) + testIndex * 120_000;
});

function backtestBody(seeded: SeededStrategy): Record<string, unknown> {
  return {
    strategyVersionId: seeded.versionId,
    kind: 'backtest',
    symbol: 'BTCUSDT',
    timeframe: '1h',
    periodStart: PERIOD_START,
    periodEnd: PERIOD_END,
  };
}

async function createRun(subject: string, seeded: SeededStrategy): Promise<string> {
  const response = await harness.call({
    subject,
    method: 'POST',
    path: RUNS,
    body: backtestBody(seeded),
  });
  expect(response.status).toBe(202);
  return ((await response.json()) as { data: { id: string } }).data.id;
}

function finish(runId: string): void {
  harness.runs.updateRun(runId, { status: 'completed', finishedAt: new Date() });
}

function remove(subject: string, runId: string): Promise<Response> {
  return harness.call({ subject, method: 'DELETE', path: `${RUNS}/${runId}` });
}

describe('DELETE /v1/runs/:id (exclusão lógica da execução do dono)', () => {
  test('exige token', async () => {
    expect((await harness.call({ method: 'DELETE', path: `${RUNS}/${MISSING_ID}` })).status).toBe(
      401,
    );
  });

  test('execução terminada: 204, e some da lista, do detalhe, das séries e da exportação', async () => {
    const runId = await createRun(SUBJECT_A, seededA);
    finish(runId);
    expect((await remove(SUBJECT_A, runId)).status).toBe(204);
    expect((await harness.call({ subject: SUBJECT_A, path: `${RUNS}/${runId}` })).status).toBe(404);
    const { body } = await readJson(await harness.call({ subject: SUBJECT_A, path: RUNS }));
    expect((body as { data: { id: string }[] }).data.map((row) => row.id)).not.toContain(runId);
    for (const suffix of ['/signals', '/equity', '/export.csv']) {
      const response = await harness.call({
        subject: SUBJECT_A,
        path: `${RUNS}/${runId}${suffix}`,
      });
      expect(response.status).toBe(404);
    }
    expect((await remove(SUBJECT_A, runId)).status).toBe(404);
  });

  test('execução ainda na fila ou rodando: 409 RUN_NOT_FINISHED e nada é apagado', async () => {
    const runId = await createRun(SUBJECT_A, seededA);
    const refused = await remove(SUBJECT_A, runId);
    expect(refused.status).toBe(409);
    expect(((await refused.json()) as { error: { code: string } }).error.code).toBe(
      'RUN_NOT_FINISHED',
    );
    expect((await harness.call({ subject: SUBJECT_A, path: `${RUNS}/${runId}` })).status).toBe(200);
  });

  test('contrato negativo: a execução de A é, para B, idêntica a uma inexistente, e continua intacta', async () => {
    const runId = await createRun(SUBJECT_A, seededA);
    finish(runId);
    await expectIndistinguishableNotFound({
      foreignResourceResponse: await remove(SUBJECT_B, runId),
      missingResourceResponse: await remove(SUBJECT_B, MISSING_ID),
      expectedCode: 'RUN_NOT_FOUND',
    });
    expect((await harness.call({ subject: SUBJECT_A, path: `${RUNS}/${runId}` })).status).toBe(200);
  });

  test('id malformado é o mesmo 404', async () => {
    expect((await remove(SUBJECT_A, 'nao-e-uuid')).status).toBe(404);
  });
});

describe('cota de execuções guardadas por usuário', () => {
  test('no teto, criar é 409 RUN_STORAGE_QUOTA_REACHED; apagar uma antiga libera a vaga; o teto é por usuário', async () => {
    const ids: string[] = [];
    for (let index = 0; index < STORAGE_LIMIT; index += 1) {
      const id = await createRun(SUBJECT_A, seededA);
      finish(id);
      ids.push(id);
    }
    const refused = await harness.call({
      subject: SUBJECT_A,
      method: 'POST',
      path: RUNS,
      body: backtestBody(seededA),
    });
    expect(refused.status).toBe(409);
    expect(((await refused.json()) as { error: { code: string } }).error.code).toBe(
      'RUN_STORAGE_QUOTA_REACHED',
    );
    await createRun(SUBJECT_B, seededB);
    expect((await remove(SUBJECT_A, ids[0] ?? '')).status).toBe(204);
    await createRun(SUBJECT_A, seededA);
  });

  test('a cota conta as execuções guardadas de qualquer tipo e estado, não só a fila', async () => {
    for (let index = 0; index < STORAGE_LIMIT; index += 1) {
      const id = await createRun(SUBJECT_A, seededA);
      harness.runs.updateRun(id, { status: 'failed', finishedAt: new Date() });
    }
    const refused = await harness.call({
      subject: SUBJECT_A,
      method: 'POST',
      path: RUNS,
      body: {
        ...backtestBody(seededA),
        kind: 'live_paper',
        periodStart: undefined,
        periodEnd: undefined,
      },
    });
    expect(refused.status).toBe(409);
  });
});
