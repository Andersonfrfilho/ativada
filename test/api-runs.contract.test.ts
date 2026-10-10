// Copyright (c) 2026 Ada Technology. All rights reserved.
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';

import { expectIndistinguishableNotFound } from './fixtures/not-found-response.fixture.js';
import {
  buildHourlyCandles,
  createRunsHarness,
  MISSING_ID,
  readJson,
  SUBJECT_A,
  SUBJECT_B,
  USER_A_ID,
  type RunsHarness,
  type SeededStrategy,
} from './fixtures/api-routes/runs-harness.fixture.js';

const RUNS = '/v1/runs';
const PERIOD_START = Date.UTC(2024, 0, 1);
const PERIOD_END = Date.UTC(2026, 0, 1);
const GRID = { parameters: [{ path: 'thresholds.buy', values: ['1', '1.5', '2'] }] };

let harness: RunsHarness;
let seededA: SeededStrategy;
let seededB: SeededStrategy;

type ErrorBody = {
  error: { code: string; message: string; details?: { field: string; reason: string }[] };
};
type RunBody = {
  data: Record<string, unknown> & { id: string; status: string; warnings: { code: string }[] };
};

beforeAll(async () => {
  harness = await createRunsHarness({
    candles: buildHourlyCandles({ symbol: 'BTCUSDT', count: 48, firstOpenTime: PERIOD_START }),
  });
  seededA = await harness.seedStrategy(SUBJECT_A, 'a');
  seededB = await harness.seedStrategy(SUBJECT_B, 'b');
});

afterAll(async () => {
  await harness.stop();
});

let testIndex = 0;

// Cada teste anda dois minutos no relógio injetado: o limite de 20 criações por minuto é medido nele e os testes não
// consomem a cota uns dos outros.
beforeEach(() => {
  harness.dispatch.shouldFail = false;
  testIndex += 1;
  harness.clock.now = Date.UTC(2026, 9, 1) + testIndex * 120_000;
});

function backtestBody(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    strategyVersionId: seededA.versionId,
    kind: 'backtest',
    symbol: 'BTCUSDT',
    timeframe: '1h',
    periodStart: PERIOD_START,
    periodEnd: PERIOD_END,
    ...overrides,
  };
}

function walkForwardBody(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return backtestBody({ kind: 'walk_forward', timeframe: '1d', grid: GRID, ...overrides });
}

async function post(
  subject: string,
  body: unknown,
  rawBody?: string,
): Promise<{ status: number; body: unknown }> {
  const response = await harness.call({
    subject,
    method: 'POST',
    path: RUNS,
    ...(rawBody === undefined ? { body } : { rawBody }),
  });
  return readJson(response);
}

describe('POST /v1/runs', () => {
  test('exige token', async () => {
    const response = await harness.call({ method: 'POST', path: RUNS, body: backtestBody() });
    expect(response.status).toBe(401);
  });

  test('backtest: cria queued, despacha { runId, kind } e responde 202 com o id, sem hash nem dono', async () => {
    const dispatchedBefore = harness.dispatched.length;
    const { status, body } = await post(SUBJECT_A, backtestBody());
    const data = (body as RunBody).data;
    expect(status).toBe(202);
    expect(data).toMatchObject({
      kind: 'backtest',
      status: 'queued',
      symbol: 'BTCUSDT',
      timeframe: '1h',
    });
    expect(harness.dispatched).toHaveLength(dispatchedBefore + 1);
    expect(harness.dispatched.at(-1)).toStrictEqual({ runId: data.id, kind: 'backtest' });
    expect(data['runParameters']).toMatchObject({ initialBalance: '10000', feeRate: '0.001' });
    const text = JSON.stringify(body);
    for (const forbidden of ['runHash', 'userId', 'user_id', 'engineState', USER_A_ID]) {
      expect(text).not.toContain(forbidden);
    }
    const stored = harness.runs.all().find((run) => run.id === data.id);
    expect(stored?.request).toBeUndefined();
    expect(stored?.periodStart).toBe(PERIOD_START);
  });

  test('a resposta bate com o esquema documentado', async () => {
    const route = harness.routes.find((r) => r.path === RUNS && r.method === 'POST');
    const { body } = await post(SUBJECT_A, backtestBody());
    expect(
      route?.documentation?.successes[0]?.schema?.safeParse((body as RunBody).data).success,
    ).toBe(true);
  });

  test('devolve os avisos do warnRunParameters (custos zerados) contra o preço do primeiro candle', async () => {
    const { body } = await post(
      SUBJECT_A,
      backtestBody({ runParameters: { feeRate: '0', slippageRate: '0' } }),
    );
    const codes = (body as RunBody).data.warnings.map((warning) => warning.code).sort();
    expect(codes).toStrictEqual(['fee_rate_is_zero', 'slippage_rate_is_zero']);
  });

  test('walk-forward: grava o pedido (grade e janelas) na linha e despacha', async () => {
    const { status, body } = await post(
      SUBJECT_A,
      walkForwardBody({
        windows: { trainMonths: 6, testMonths: 2, stepMonths: 2, minTradesPerWindow: 5 },
      }),
    );
    const data = (body as RunBody).data;
    expect(status).toBe(202);
    expect(harness.dispatched.at(-1)).toStrictEqual({ runId: data.id, kind: 'walk_forward' });
    const stored = harness.runs.all().find((run) => run.id === data.id);
    expect(stored?.request).toStrictEqual({
      grid: GRID,
      trainMonths: 6,
      testMonths: 2,
      stepMonths: 2,
      minTradesPerWindow: 5,
    });
  });

  test('erros do corpo saem TODOS de uma vez, sem eco de valores', async () => {
    const response = await harness.call({
      subject: SUBJECT_A,
      method: 'POST',
      path: RUNS,
      body: backtestBody({
        symbol: 'DOGEUSDT-secreto',
        timeframe: '2h',
        kind: 'maluco',
        runParameters: { feeRate: 'abc-secreto', tickSize: '-1' },
        userId: USER_A_ID,
      }),
    });
    const text = await response.text();
    const body = JSON.parse(text) as ErrorBody;
    expect(response.status).toBe(400);
    expect(body.error.code).toBe('REQUEST_VALIDATION_FAILED');
    const fields = new Set((body.error.details ?? []).map((detail) => detail.field));
    for (const expected of [
      'symbol',
      'timeframe',
      'kind',
      'runParameters.feeRate',
      'runParameters.tickSize',
      '(body)',
    ]) {
      expect(fields.has(expected)).toBe(true);
    }
    for (const echoed of ['DOGEUSDT-secreto', 'abc-secreto', 'maluco', USER_A_ID]) {
      expect(text).not.toContain(echoed);
    }
  });

  test('regras entre campos também saem juntas: período invertido, grade em backtest, janelas em backtest', async () => {
    const response = await harness.call({
      subject: SUBJECT_A,
      method: 'POST',
      path: RUNS,
      body: backtestBody({ periodEnd: PERIOD_START, grid: GRID, windows: { trainMonths: 6 } }),
    });
    const body = (await response.json()) as ErrorBody;
    expect(response.status).toBe(400);
    expect(
      (body.error.details ?? []).map((detail) => `${detail.field}:${detail.reason}`).sort(),
    ).toStrictEqual([
      'grid:not_allowed_for_kind',
      'periodEnd:must_be_after_period_start',
      'windows:not_allowed_for_kind',
    ]);
  });

  test('walk-forward sem grade é 400', async () => {
    const response = await harness.call({
      subject: SUBJECT_A,
      method: 'POST',
      path: RUNS,
      body: walkForwardBody({ grid: undefined }),
    });
    const body = (await response.json()) as ErrorBody;
    expect(response.status).toBe(400);
    expect(body.error.details).toStrictEqual([
      { field: 'grid', reason: 'required_for_walk_forward' },
    ]);
  });

  test('corpo que não é JSON é 400', async () => {
    const { status } = await post(SUBJECT_A, undefined, '{nao-json');
    expect(status).toBe(400);
  });

  test('userId no corpo é recusado e nada é criado nem despachado', async () => {
    const runsBefore = harness.runs.all().length;
    const dispatchedBefore = harness.dispatched.length;
    const { status } = await post(SUBJECT_B, {
      ...backtestBody({ strategyVersionId: seededB.versionId }),
      userId: USER_A_ID,
    });
    expect(status).toBe(400);
    expect(harness.runs.all()).toHaveLength(runsBefore);
    expect(harness.dispatched).toHaveLength(dispatchedBefore);
  });

  test.each([
    [
      'GRID_TOO_LARGE',
      {
        parameters: [
          {
            path: 'rules.ema-9-21.fastPeriod',
            values: Array.from({ length: 20 }, (_u, i) => 2 + i),
          },
          {
            path: 'rules.ema-9-21.slowPeriod',
            values: Array.from({ length: 20 }, (_u, i) => 22 + i),
          },
        ],
      },
    ],
    ['INVALID_GRID', { parameters: [{ path: 'caminho.secreto-xyz', values: [1] }] }],
    [
      'NO_VALID_COMBINATIONS',
      {
        parameters: [
          { path: 'rules.ema-9-21.fastPeriod', values: [30, 40] },
          { path: 'rules.ema-9-21.slowPeriod', values: [21] },
        ],
      },
    ],
  ])('grade recusada ANTES de aceitar: %s', async (code, grid) => {
    const runsBefore = harness.runs.all().length;
    const response = await harness.call({
      subject: SUBJECT_A,
      method: 'POST',
      path: RUNS,
      body: walkForwardBody({ grid }),
    });
    const text = await response.text();
    expect(response.status).toBe(400);
    expect((JSON.parse(text) as ErrorBody).error.code).toBe(code);
    expect(text).not.toContain('secreto-xyz');
    expect(harness.runs.all()).toHaveLength(runsBefore);
  });

  test('PERIOD_TOO_SHORT: o plano de janelas precisa de 3 janelas', async () => {
    const response = await harness.call({
      subject: SUBJECT_A,
      method: 'POST',
      path: RUNS,
      body: walkForwardBody({ periodStart: Date.UTC(2025, 0, 1), periodEnd: Date.UTC(2025, 8, 1) }),
    });
    const body = (await response.json()) as ErrorBody;
    expect(response.status).toBe(400);
    expect(body.error.code).toBe('PERIOD_TOO_SHORT');
  });

  test('janela inválida (passo menor que o teste) é INVALID_WINDOW_CONFIG', async () => {
    const response = await harness.call({
      subject: SUBJECT_A,
      method: 'POST',
      path: RUNS,
      body: walkForwardBody({ windows: { testMonths: 3, stepMonths: 1 } }),
    });
    expect(((await response.json()) as ErrorBody).error.code).toBe('INVALID_WINDOW_CONFIG');
  });

  test('live_paper responde 501 LIVE_RUNS_NOT_AVAILABLE e não cria nada', async () => {
    const runsBefore = harness.runs.all().length;
    const response = await harness.call({
      subject: SUBJECT_A,
      method: 'POST',
      path: RUNS,
      body: backtestBody({ kind: 'live_paper' }),
    });
    expect(response.status).toBe(501);
    expect(((await response.json()) as ErrorBody).error.code).toBe('LIVE_RUNS_NOT_AVAILABLE');
    expect(harness.runs.all()).toHaveLength(runsBefore);
  });

  test('versão de estratégia de OUTRO dono: 404 STRATEGY_VERSION_NOT_FOUND idêntico ao inexistente (inclusive live_paper)', async () => {
    for (const kind of ['backtest', 'walk_forward', 'live_paper']) {
      const runsBefore = harness.runs.all().length;
      const foreign = await harness.call({
        subject: SUBJECT_B,
        method: 'POST',
        path: RUNS,
        body: backtestBody({
          kind,
          strategyVersionId: seededA.versionId,
          ...(kind === 'walk_forward' ? { grid: GRID, timeframe: '1d' } : {}),
        }),
      });
      const missing = await harness.call({
        subject: SUBJECT_B,
        method: 'POST',
        path: RUNS,
        body: backtestBody({
          kind,
          strategyVersionId: MISSING_ID,
          ...(kind === 'walk_forward' ? { grid: GRID, timeframe: '1d' } : {}),
        }),
      });
      await expectIndistinguishableNotFound({
        expectedCode: 'STRATEGY_VERSION_NOT_FOUND',
        foreignResourceResponse: foreign,
        missingResourceResponse: missing,
      });
      expect(harness.runs.all()).toHaveLength(runsBefore);
    }
  });

  test('falha ao despachar: a execução vira failed com DISPATCH_FAILED, nunca fica queued', async () => {
    harness.dispatch.shouldFail = true;
    const { status, body } = await post(SUBJECT_A, backtestBody());
    const data = (body as RunBody).data;
    expect(status).toBe(202);
    expect(data).toMatchObject({ status: 'failed', errorCode: 'DISPATCH_FAILED' });
    const fetched = await readJson(
      await harness.call({ subject: SUBJECT_A, path: `${RUNS}/${data.id}` }),
    );
    expect((fetched.body as RunBody).data).toMatchObject({
      status: 'failed',
      errorCode: 'DISPATCH_FAILED',
    });
    expect(harness.runs.all().some((run) => run.status === 'queued' && run.id === data.id)).toBe(
      false,
    );
  });

  test('limite de 20 criações por minuto por usuário: a 21ª é 429', async () => {
    const limited = await createRunsHarness();
    try {
      const seeded = await limited.seedStrategy(SUBJECT_A, 'limite');
      const policy = limited.app.policies.RATE_LIMIT_POLICY.EXECUTION_CREATION;
      expect(policy.limit).toBe(20);
      for (let attempt = 0; attempt < policy.limit; attempt += 1) {
        const response = await limited.call({
          subject: SUBJECT_A,
          method: 'POST',
          path: RUNS,
          body: backtestBody({ strategyVersionId: seeded.versionId }),
        });
        expect(response.status).toBe(202);
      }
      const blocked = await limited.call({
        subject: SUBJECT_A,
        method: 'POST',
        path: RUNS,
        body: backtestBody({ strategyVersionId: seeded.versionId }),
      });
      expect(blocked.status).toBe(429);
      const { body } = await readJson(blocked);
      expect((body as ErrorBody).error.code).toBe('RATE_LIMITED');
    } finally {
      await limited.stop();
    }
  });
});

describe('GET /v1/runs/:id', () => {
  test('traz status, progresso, métricas, alerta de overfitting e avisos', async () => {
    const { body } = await post(
      SUBJECT_A,
      walkForwardBody({ timeframe: '1h', runParameters: { feeRate: '0' } }),
    );
    const id = (body as RunBody).data.id;
    harness.runs.updateRun(id, {
      status: 'completed',
      progress: 100,
      metrics: { totalReturn: '0.1', overfitting: { isAlert: true, reasons: ['x'] } },
    });
    const fetched = await readJson(
      await harness.call({ subject: SUBJECT_A, path: `${RUNS}/${id}` }),
    );
    const data = (fetched.body as RunBody).data;
    expect(fetched.status).toBe(200);
    expect(data).toMatchObject({
      status: 'completed',
      progress: 100,
      metrics: { totalReturn: '0.1' },
      overfitting: { isAlert: true },
    });
    expect(data.warnings.map((warning) => warning.code)).toContain('fee_rate_is_zero');
  });

  test('backtest não tem overfitting: vem nulo', async () => {
    const { body } = await post(SUBJECT_A, backtestBody());
    const fetched = await readJson(
      await harness.call({ subject: SUBJECT_A, path: `${RUNS}/${(body as RunBody).data.id}` }),
    );
    expect((fetched.body as RunBody).data['overfitting']).toBeNull();
  });

  test('a resposta bate com o esquema documentado', async () => {
    const route = harness.routes.find((r) => r.path === `${RUNS}/:runId` && r.method === 'GET');
    const { body } = await post(SUBJECT_A, backtestBody());
    const fetched = await readJson(
      await harness.call({ subject: SUBJECT_A, path: `${RUNS}/${(body as RunBody).data.id}` }),
    );
    expect(
      route?.documentation?.successes[0]?.schema?.safeParse((fetched.body as RunBody).data).success,
    ).toBe(true);
  });

  test('execução de outro dono, inexistente e id malformado: o MESMO 404 RUN_NOT_FOUND', async () => {
    const { body } = await post(SUBJECT_A, backtestBody());
    const id = (body as RunBody).data.id;
    const foreign = await harness.call({ subject: SUBJECT_B, path: `${RUNS}/${id}` });
    const missing = await harness.call({ subject: SUBJECT_B, path: `${RUNS}/${MISSING_ID}` });
    const malformed = await harness.call({ subject: SUBJECT_B, path: `${RUNS}/nao-e-uuid` });
    await expectIndistinguishableNotFound({
      expectedCode: 'RUN_NOT_FOUND',
      foreignResourceResponse: foreign,
      missingResourceResponse: missing,
    });
    await expectIndistinguishableNotFound({
      expectedCode: 'RUN_NOT_FOUND',
      foreignResourceResponse: malformed,
      missingResourceResponse: await harness.call({
        subject: SUBJECT_B,
        path: `${RUNS}/${MISSING_ID}`,
      }),
    });
  });
});

describe('GET /v1/runs', () => {
  test('lista as do dono por cursor (mais novas primeiro), filtra por kind e nunca mostra as de outro', async () => {
    const isolated = await createRunsHarness();
    try {
      const seededOne = await isolated.seedStrategy(SUBJECT_A, 'lista');
      const seededTwo = await isolated.seedStrategy(SUBJECT_B, 'lista');
      const created: string[] = [];
      for (let index = 0; index < 4; index += 1) {
        const { body } = await readJson(
          await isolated.call({
            subject: SUBJECT_A,
            method: 'POST',
            path: RUNS,
            body: backtestBody({ strategyVersionId: seededOne.versionId }),
          }),
        );
        created.push((body as RunBody).data.id);
      }
      const foreignOne = await readJson(
        await isolated.call({
          subject: SUBJECT_B,
          method: 'POST',
          path: RUNS,
          body: backtestBody({ strategyVersionId: seededTwo.versionId }),
        }),
      );
      const first = await readJson(
        await isolated.call({ subject: SUBJECT_A, path: `${RUNS}?limit=3` }),
      );
      const page = first.body as {
        data: { id: string }[];
        pagination: { nextCursor: string; perPage: number };
      };
      expect(page.data.map((row) => row.id)).toStrictEqual([
        created[3] ?? '',
        created[2] ?? '',
        created[1] ?? '',
      ]);
      expect(page.pagination.perPage).toBe(3);
      const second = await readJson(
        await isolated.call({
          subject: SUBJECT_A,
          path: `${RUNS}?limit=3&cursor=${encodeURIComponent(page.pagination.nextCursor)}`,
        }),
      );
      expect((second.body as { data: { id: string }[] }).data.map((row) => row.id)).toStrictEqual([
        created[0] ?? '',
      ]);
      const idsB = (
        (await readJson(await isolated.call({ subject: SUBJECT_B, path: `${RUNS}?limit=100` })))
          .body as { data: { id: string }[] }
      ).data.map((row) => row.id);
      expect(idsB).toStrictEqual([(foreignOne.body as RunBody).data.id]);
      const wf = await readJson(
        await isolated.call({ subject: SUBJECT_A, path: `${RUNS}?kind=walk_forward` }),
      );
      expect((wf.body as { data: unknown[] }).data).toStrictEqual([]);
    } finally {
      await isolated.stop();
    }
  });

  test('limit acima de 100, kind inválido e cursor adulterado são 400', async () => {
    const forgedInstant = Buffer.from(JSON.stringify({ c: 'abc', i: MISSING_ID })).toString(
      'base64url',
    );
    for (const query of [
      'limit=101',
      'kind=outro',
      'cursor=bm90LWpzb24',
      `cursor=${forgedInstant}`,
      'userId=x',
    ]) {
      const response = await harness.call({ subject: SUBJECT_A, path: `${RUNS}?${query}` });
      expect({ query, status: response.status }).toStrictEqual({ query, status: 400 });
    }
  });
});

describe('POST /v1/runs/:id/stop', () => {
  test('cancela queued; repetir é idempotente', async () => {
    const { body } = await post(SUBJECT_A, backtestBody());
    const id = (body as RunBody).data.id;
    const first = await readJson(
      await harness.call({ subject: SUBJECT_A, method: 'POST', path: `${RUNS}/${id}/stop` }),
    );
    expect(first.status).toBe(200);
    expect(first.body).toStrictEqual({ data: { id, status: 'cancelled' } });
    const second = await readJson(
      await harness.call({ subject: SUBJECT_A, method: 'POST', path: `${RUNS}/${id}/stop` }),
    );
    expect(second.status).toBe(200);
    expect(second.body).toStrictEqual({ data: { id, status: 'cancelled' } });
  });

  test('cancela running de qualquer tipo, walk-forward incluído', async () => {
    const { body } = await post(SUBJECT_A, walkForwardBody());
    const id = (body as RunBody).data.id;
    harness.runs.updateRun(id, { status: 'running' });
    const stopped = await readJson(
      await harness.call({ subject: SUBJECT_A, method: 'POST', path: `${RUNS}/${id}/stop` }),
    );
    expect((stopped.body as RunBody).data['status']).toBe('cancelled');
  });

  test.each(['completed', 'failed'] as const)(
    'execução %s: 409 RUN_ALREADY_FINISHED e nada muda',
    async (finalStatus) => {
      const { body } = await post(SUBJECT_A, backtestBody());
      const id = (body as RunBody).data.id;
      harness.runs.updateRun(id, { status: finalStatus });
      const response = await harness.call({
        subject: SUBJECT_A,
        method: 'POST',
        path: `${RUNS}/${id}/stop`,
      });
      expect(response.status).toBe(409);
      expect(((await response.json()) as ErrorBody).error.code).toBe('RUN_ALREADY_FINISHED');
      expect(harness.runs.all().find((run) => run.id === id)?.status).toBe(finalStatus);
    },
  );

  test('B não para a execução de A: 404 idêntico ao inexistente e a execução de A segue intacta', async () => {
    const { body } = await post(SUBJECT_A, backtestBody());
    const id = (body as RunBody).data.id;
    const foreign = await harness.call({
      subject: SUBJECT_B,
      method: 'POST',
      path: `${RUNS}/${id}/stop`,
    });
    const missing = await harness.call({
      subject: SUBJECT_B,
      method: 'POST',
      path: `${RUNS}/${MISSING_ID}/stop`,
    });
    await expectIndistinguishableNotFound({
      expectedCode: 'RUN_NOT_FOUND',
      foreignResourceResponse: foreign,
      missingResourceResponse: missing,
    });
    expect(harness.runs.all().find((run) => run.id === id)?.status).toBe('queued');
  });
});
