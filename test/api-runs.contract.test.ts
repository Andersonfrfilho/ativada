// Copyright (c) 2026 Ada Technology. All rights reserved.
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';

import { computeBalanceSurvival } from '../packages/strategy-engine/src/survival/compute-balance-survival.js';
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
const HOUR = 3_600_000;
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
  // As simulações ao vivo criadas por um teste não podem consumir o teto de ativas do seguinte.
  for (const run of harness.runs.all()) {
    if (run.status === 'queued' || run.status === 'running') {
      harness.runs.updateRun(run.id, { status: 'cancelled', finishedAt: new Date() });
    }
  }
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

function bodyOf(kind: string, overrides: Record<string, unknown>): Record<string, unknown> {
  if (kind === 'live_paper') return liveBody(overrides);
  if (kind === 'walk_forward') return walkForwardBody(overrides);
  return backtestBody(overrides);
}

function withoutKeys(
  record: Record<string, unknown>,
  keys: readonly string[],
): Record<string, unknown> {
  return Object.fromEntries(Object.entries(record).filter(([key]) => !keys.includes(key)));
}

function liveBody(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    strategyVersionId: seededA.versionId,
    kind: 'live_paper',
    symbol: 'BTCUSDT',
    timeframe: '1h',
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

  test('live_paper cria a execução `queued` a partir do relógio, sem período e sem despachar para a fila de backtests', async () => {
    const dispatchedBefore = harness.dispatched.length;
    const { status, body } = await post(SUBJECT_A, liveBody());
    const data = (body as RunBody).data;
    expect(status).toBe(202);
    expect(data).toMatchObject({
      kind: 'live_paper',
      status: 'queued',
      periodEnd: null,
      lastCandleTime: null,
      errorCode: null,
      queuePosition: null,
    });
    expect(data['periodStart']).toBe(Math.floor(harness.clock.now / HOUR) * HOUR);
    expect(harness.dispatched).toHaveLength(dispatchedBefore);
    expect(harness.runs.all().find((run) => run.id === data.id)?.kind).toBe('live_paper');
  });

  test('live_paper não aceita período: o início é o candle corrente e não há fim', async () => {
    const runsBefore = harness.runs.all().length;
    for (const field of ['periodStart', 'periodEnd']) {
      const { status, body } = await post(SUBJECT_A, liveBody({ [field]: PERIOD_START }));
      const details = (body as ErrorBody).error.details ?? [];
      expect(status).toBe(400);
      expect(details).toContainEqual({ field, reason: 'not_allowed_for_kind' });
    }
    expect(harness.runs.all()).toHaveLength(runsBefore);
  });

  test('backtest e walk-forward exigem o período inteiro', async () => {
    const withoutPeriod = withoutKeys(backtestBody(), ['periodStart', 'periodEnd']);
    const { status, body } = await post(SUBJECT_A, withoutPeriod);
    const details = (body as ErrorBody).error.details ?? [];
    expect(status).toBe(400);
    expect(details).toContainEqual({ field: 'periodStart', reason: 'required' });
    expect(details).toContainEqual({ field: 'periodEnd', reason: 'required' });
  });

  test('a simulação ao vivo pode ser lida e parada (idempotente); outro usuário recebe o 404 do inexistente', async () => {
    const created = (await post(SUBJECT_A, liveBody())).body as RunBody;
    const runId = created.data.id;
    const read = await readJson(
      await harness.call({ subject: SUBJECT_A, path: `${RUNS}/${runId}` }),
    );
    expect((read.body as RunBody).data).toMatchObject({ kind: 'live_paper', status: 'queued' });
    const foreignStop = await harness.call({
      subject: SUBJECT_B,
      method: 'POST',
      path: `${RUNS}/${runId}/stop`,
    });
    const missingStop = await harness.call({
      subject: SUBJECT_B,
      method: 'POST',
      path: `${RUNS}/${MISSING_ID}/stop`,
    });
    await expectIndistinguishableNotFound({
      expectedCode: 'RUN_NOT_FOUND',
      foreignResourceResponse: foreignStop,
      missingResourceResponse: missingStop,
    });
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const stopped = await harness.call({
        subject: SUBJECT_A,
        method: 'POST',
        path: `${RUNS}/${runId}/stop`,
      });
      expect(stopped.status).toBe(200);
      expect((await readJson(stopped)).body).toMatchObject({ data: { status: 'cancelled' } });
    }
  });

  test('a simulação ao vivo traz o piso e a meta de dobro desde a criação (padrão 80% e 2×)', async () => {
    const { body } = await post(SUBJECT_A, liveBody());
    const data = (body as RunBody).data;
    expect(data['survival']).toMatchObject({
      version: 'survival-1',
      initialBalance: '10000',
      floor: { level: '8000', isReached: false, elapsedMilliseconds: null, progress: '0' },
      double: { level: '20000', isReached: false, elapsedMilliseconds: null, progress: '0' },
      lowestEquity: null,
      observedMilliseconds: 0,
    });
  });

  test('piso e dobro configuráveis na criação e guardados no pedido da execução', async () => {
    const { status, body } = await post(
      SUBJECT_A,
      liveBody({ survival: { floorRate: '0.9', doubleRate: '1.5' } }),
    );
    const data = (body as RunBody).data;
    expect(status).toBe(202);
    expect(data['survival']).toMatchObject({
      floor: { level: '9000' },
      double: { level: '15000' },
    });
    expect(harness.runs.all().find((run) => run.id === data.id)?.request).toStrictEqual({
      survival: { floorRate: '0.9', doubleRate: '1.5' },
    });
    const read = await readJson(
      await harness.call({ subject: SUBJECT_A, path: `${RUNS}/${data.id}` }),
    );
    expect((read.body as RunBody).data['survival']).toMatchObject({ floor: { level: '9000' } });
  });

  test('configuração de sobrevivência inválida: todos os erros de uma vez, sem repetir o valor', async () => {
    const { status, body } = await post(
      SUBJECT_A,
      liveBody({ survival: { floorRate: 'ValorQueNaoPodeVazar', doubleRate: '1' } }),
    );
    const errorBody = body as ErrorBody;
    expect(status).toBe(400);
    const fields = (errorBody.error.details ?? []).map((detail) => detail.field);
    expect(fields).toContain('survival.floorRate');
    expect(fields).toContain('survival.doubleRate');
    expect(JSON.stringify(body)).not.toContain('ValorQueNaoPodeVazar');
  });

  test('só a simulação ao vivo aceita configuração de sobrevivência', async () => {
    const { status, body } = await post(
      SUBJECT_A,
      backtestBody({ survival: { floorRate: '0.9' } }),
    );
    expect(status).toBe(400);
    expect((body as ErrorBody).error.details).toContainEqual({
      field: 'survival',
      reason: 'not_allowed_for_kind',
    });
  });

  test('GET calcula o tempo até o piso e até o dobro a partir da curva de patrimônio gravada', async () => {
    const { body } = await post(SUBJECT_A, liveBody());
    const created = (body as RunBody).data;
    const start = created['periodStart'] as number;
    harness.runs.seed(created.id, 'equity', [
      { candleTime: start, equity: '10100', equityAtLow: '9900', benchmark: '10000' },
      { candleTime: start + HOUR, equity: '9000', equityAtLow: '7950', benchmark: '10000' },
      { candleTime: start + 2 * HOUR, equity: '20500', equityAtLow: '9000', benchmark: '10000' },
    ]);
    const read = await readJson(
      await harness.call({ subject: SUBJECT_A, path: `${RUNS}/${created.id}` }),
    );
    expect((read.body as RunBody).data['survival']).toMatchObject({
      floor: {
        isReached: true,
        reachedAtCandleTime: start + HOUR,
        elapsedMilliseconds: 2 * HOUR,
        progress: '1',
      },
      double: {
        isReached: true,
        reachedAtCandleTime: start + 2 * HOUR,
        elapsedMilliseconds: 3 * HOUR,
        progress: '1',
      },
      lowestEquity: '7950',
      highestEquity: '20500',
      observedUntilCandleTime: start + 2 * HOUR,
    });
  });

  test('GET acha o piso tocado no último ponto de uma série longa sem trazer a série: no máximo cinco linhas', async () => {
    const { body } = await post(SUBJECT_A, liveBody());
    const created = (body as RunBody).data;
    const start = created['periodStart'] as number;
    const count = 10_500;
    const points = Array.from({ length: count }, (_unused, index) => ({
      candleTime: start + index * HOUR,
      equity: '10100',
      equityAtLow: index === count - 1 ? '7000' : '10000',
      benchmark: '10000',
    }));
    harness.runs.seed(created.id, 'equity', points);
    harness.runs.listCalls.equity.length = 0;
    harness.runs.survivalRowsRead.length = 0;
    const read = await readJson(
      await harness.call({ subject: SUBJECT_A, path: `${RUNS}/${created.id}` }),
    );
    expect((read.body as RunBody).data['survival']).toMatchObject({
      floor: { isReached: true, reachedAtCandleTime: start + (count - 1) * HOUR },
      observedMilliseconds: count * HOUR,
    });
    expect(harness.runs.listCalls.equity).toHaveLength(0);
    expect(harness.runs.survivalRowsRead).toHaveLength(1);
    expect(Math.max(...harness.runs.survivalRowsRead)).toBeLessThanOrEqual(5);
  });

  test('o custo não cresce com a série: 100 ou 20.000 pontos leem as mesmas poucas linhas', async () => {
    const rowsReadFor = async (count: number): Promise<number> => {
      const { body } = await post(SUBJECT_A, liveBody());
      const created = (body as RunBody).data;
      const start = created['periodStart'] as number;
      harness.runs.seed(
        created.id,
        'equity',
        Array.from({ length: count }, (_unused, index) => ({
          candleTime: start + index * HOUR,
          equity: String(10_000 + (index % 7)),
          equityAtLow: String(9_900 + (index % 5)),
          benchmark: '10000',
        })),
      );
      harness.runs.survivalRowsRead.length = 0;
      await harness.call({ subject: SUBJECT_A, path: `${RUNS}/${created.id}` });
      return harness.runs.survivalRowsRead[0] ?? -1;
    };
    const small = await rowsReadFor(100);
    const large = await rowsReadFor(20_000);
    expect(small).toBeGreaterThan(0);
    expect(large).toBe(small);
  });

  test('paridade: a resposta é idêntica à função pura sobre a série completa, em séries de formas diferentes', async () => {
    const shapes: Record<string, (index: number, count: number) => [number, number]> = {
      'nunca toca nada': () => [10_100, 9_900],
      'só o piso': (index, count) => [10_000, index > count / 2 ? 7_900 : 9_500],
      'só o dobro': (index, count) => [index === count - 1 ? 21_000 : 12_000, 11_000],
      'dobro antes do piso': (index) => [
        index === 3 ? 20_000 : 9_000,
        index === 10 ? 7_000 : 9_000,
      ],
      'empates no vale e no pico': (index) => [
        10_500 + (index % 2) * 300,
        9_000 + (index % 3) * 200,
      ],
      'tudo igual': () => [10_000, 10_000],
      // O primeiro cruzamento NÃO é o vale mais fundo nem o pico: quem escolhe os pontos precisa dos níveis certos.
      'piso tocado cedo e vale mais fundo depois': (index) => [10_000, 9_900 - index * 40],
      'dobro alcançado cedo e pico mais alto depois': (index) => [10_000 + index * 250, 10_000],
    };
    for (const [name, shape] of Object.entries(shapes)) {
      const { body } = await post(SUBJECT_A, liveBody());
      const created = (body as RunBody).data;
      const start = created['periodStart'] as number;
      const count = 60;
      const warmup = [{ candleTime: start - HOUR, equity: '1', equityAtLow: '1', benchmark: '1' }];
      const series = Array.from({ length: count }, (_unused, index) => {
        const [equity, equityAtLow] = shape(index, count);
        return {
          candleTime: start + index * HOUR,
          equity: String(equity),
          equityAtLow: String(equityAtLow),
          benchmark: '10000',
        };
      });
      harness.runs.seed(created.id, 'equity', [...warmup, ...series]);
      const read = await readJson(
        await harness.call({ subject: SUBJECT_A, path: `${RUNS}/${created.id}` }),
      );
      const expected = computeBalanceSurvival({
        initialBalance: '10000',
        startTime: start,
        durationMilliseconds: HOUR,
        settings: { floorRate: '0.8', doubleRate: '2' },
        points: [...warmup, ...series].map((point) => ({
          candleOpenTime: point.candleTime,
          equity: point.equity,
          equityAtLow: point.equityAtLow,
        })),
      });
      expect({ name, survival: (read.body as RunBody).data['survival'] }).toStrictEqual({
        name,
        survival: expected,
      });
      // O teto de simulações ativas por usuário: libera a vaga para a próxima forma.
      harness.runs.updateRun(created.id, { status: 'cancelled', finishedAt: new Date() });
    }
  });

  test('piso e dobro configurados guiam a escolha dos pontos que a leitura traz', async () => {
    const { body } = await post(
      SUBJECT_A,
      liveBody({ survival: { floorRate: '0.9', doubleRate: '1.5' } }),
    );
    const created = (body as RunBody).data;
    const start = created['periodStart'] as number;
    const series = Array.from({ length: 60 }, (_unused, index) => ({
      candleTime: start + index * HOUR,
      equity: String(10_000 + index * 150),
      equityAtLow: String(9_950 - index * 40),
      benchmark: '10000',
    }));
    harness.runs.seed(created.id, 'equity', series);
    const read = await readJson(
      await harness.call({ subject: SUBJECT_A, path: `${RUNS}/${created.id}` }),
    );
    const expected = computeBalanceSurvival({
      initialBalance: '10000',
      startTime: start,
      durationMilliseconds: HOUR,
      settings: { floorRate: '0.9', doubleRate: '1.5' },
      points: series.map((point) => ({
        candleOpenTime: point.candleTime,
        equity: point.equity,
        equityAtLow: point.equityAtLow,
      })),
    });
    expect((read.body as RunBody).data['survival']).toStrictEqual(expected);
  });

  test('waitingForData: null andando; com a espera gravada pelo worker, mostra desde quando e qual candle falta', async () => {
    const { body } = await post(SUBJECT_A, liveBody());
    const created = (body as RunBody).data;
    expect(created['waitingForData']).toBeNull();
    const since = Date.UTC(2026, 9, 1, 12);
    const openTime = Date.UTC(2026, 9, 1, 9);
    harness.runs.updateRun(created.id, {
      status: 'running',
      waitingSince: since,
      waitingOpenTime: openTime,
    });
    const waiting = await readJson(
      await harness.call({ subject: SUBJECT_A, path: `${RUNS}/${created.id}` }),
    );
    expect((waiting.body as RunBody).data['waitingForData']).toStrictEqual({ since, openTime });
    harness.runs.updateRun(created.id, { waitingSince: undefined, waitingOpenTime: undefined });
    const resumed = await readJson(
      await harness.call({ subject: SUBJECT_A, path: `${RUNS}/${created.id}` }),
    );
    expect((resumed.body as RunBody).data['waitingForData']).toBeNull();
  });

  test('uma espera que sobrou numa execução já terminada não aparece: só a que está rodando espera', async () => {
    const { body } = await post(SUBJECT_A, liveBody());
    const created = (body as RunBody).data;
    harness.runs.updateRun(created.id, {
      status: 'cancelled',
      finishedAt: new Date(),
      waitingSince: 1,
      waitingOpenTime: 2,
    });
    const read = await readJson(
      await harness.call({ subject: SUBJECT_A, path: `${RUNS}/${created.id}` }),
    );
    expect((read.body as RunBody).data['waitingForData']).toBeNull();
  });

  test('backtest e walk-forward não trazem o campo (é do RF09, ao vivo), nem ao criar nem ao ler', async () => {
    const { body } = await post(SUBJECT_A, backtestBody());
    const created = (body as RunBody).data;
    expect(created['survival']).toBeNull();
    harness.runs.listCalls.equity.length = 0;
    harness.runs.survivalRowsRead.length = 0;
    const read = await readJson(
      await harness.call({ subject: SUBJECT_A, path: `${RUNS}/${created.id}` }),
    );
    expect((read.body as RunBody).data['survival']).toBeNull();
    expect(harness.runs.listCalls.equity).toHaveLength(0);
    expect(harness.runs.survivalRowsRead).toHaveLength(0);
  });

  test('o piso e o dobro de outro usuário não aparecem: 404 idêntico ao do inexistente', async () => {
    const { body } = await post(SUBJECT_A, liveBody());
    const runId = (body as RunBody).data.id;
    const foreign = await harness.call({ subject: SUBJECT_B, path: `${RUNS}/${runId}` });
    const missing = await harness.call({ subject: SUBJECT_B, path: `${RUNS}/${MISSING_ID}` });
    await expectIndistinguishableNotFound({
      expectedCode: 'RUN_NOT_FOUND',
      foreignResourceResponse: foreign,
      missingResourceResponse: missing,
    });
  });

  test('versão de estratégia de OUTRO dono: 404 STRATEGY_VERSION_NOT_FOUND idêntico ao inexistente (inclusive live_paper)', async () => {
    for (const kind of ['backtest', 'walk_forward', 'live_paper']) {
      const runsBefore = harness.runs.all().length;
      const foreign = await harness.call({
        subject: SUBJECT_B,
        method: 'POST',
        path: RUNS,
        body: bodyOf(kind, { strategyVersionId: seededA.versionId }),
      });
      const missing = await harness.call({
        subject: SUBJECT_B,
        method: 'POST',
        path: RUNS,
        body: bodyOf(kind, { strategyVersionId: MISSING_ID }),
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
