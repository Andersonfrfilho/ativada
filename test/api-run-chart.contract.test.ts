// Copyright (c) 2026 Ada Technology. All rights reserved.
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';

import type {
  CandleRecord,
  CreateRunParams,
  FillInput,
  PositionInput,
  WalkForwardWindowInput,
} from '../packages/database/src/index.js';
import { expectIndistinguishableNotFound } from './fixtures/not-found-response.fixture.js';
import {
  createRunsHarness,
  EXCHANGE,
  HOUR,
  MISSING_ID,
  readJson,
  SUBJECT_A,
  SUBJECT_B,
  type RunsHarness,
} from './fixtures/api-routes/runs-harness.fixture.js';

const RUNS = '/v1/runs';
const FIRST = Date.UTC(2025, 0, 1);
const CANDLES = 400;
const MARKER_LIMIT = 500;

type Column = {
  startTime: number;
  endTime: number;
  first: string;
  last: string;
  low: string;
  high: string;
};
type Marker = Record<string, unknown> & { positionKey: string; side: string; candleTime: number };
type Cluster = { startTime: number; endTime: number; buys: number; sells: number };
type Chart = {
  symbol: string;
  timeframe: string;
  from: number;
  to: number;
  lastClosedCandleTime: number | null;
  columns: Column[];
  markers: Marker[] | null;
  clusters: Cluster[] | null;
  totals: { buys: number; sells: number };
};
type ErrorBody = { error: { code: string; details?: { field: string; reason: string }[] } };

const at = (hours: number): number => FIRST + hours * HOUR;

// Preços de cada vela i: abre em 100 + i, fecha em 100,5 + i, mínima 98 + i e máxima 108 + i (contas à mão).
function buildCandles(): readonly CandleRecord[] {
  return Array.from({ length: CANDLES }, (_unused, index) => ({
    exchange: EXCHANGE,
    symbol: 'BTCUSDT',
    timeframe: '1h' as const,
    openTime: at(index),
    closeTime: at(index) + HOUR - 1,
    open: `${100 + index}.00000000`,
    high: `${108 + index}.00000000`,
    low: `${98 + index}.00000000`,
    close: `${100 + index}.50000000`,
    volume: '1.00000000',
    tradeCount: 1,
  }));
}

let harness: RunsHarness;

async function createRunFor(
  subject: string,
  overrides: Partial<CreateRunParams> = {},
): Promise<string> {
  const seeded = await harness.seedStrategy(subject, `chart-${crypto.randomUUID()}`);
  const created = await harness.runs.repository.createRun(harness.scopeOf(subject), {
    strategyVersionId: seeded.versionId,
    kind: 'backtest',
    symbol: 'BTCUSDT',
    timeframe: '1h',
    runParameters: { symbol: 'BTCUSDT' },
    runHash: 'h'.repeat(64),
    engineVersion: 'engine-2',
    signalEngineVersion: 'signal-2',
    metricsVersion: 'metrics-1',
    periodStart: at(0),
    periodEnd: at(CANDLES),
    migratedFromRunId: undefined,
    ...overrides,
  });
  if (created === undefined) throw new Error('execução semente não criada');
  return created.id;
}

async function createCompletedBacktest(): Promise<string> {
  const runId = await createRunFor(SUBJECT_A);
  harness.runs.updateRun(runId, { status: 'completed', lastCandleTime: at(CANDLES - 1) });
  return runId;
}

async function chart(
  runId: string,
  query = '',
  subject: string | undefined = SUBJECT_A,
): Promise<Chart> {
  const { status, body } = await readJson(
    await harness.call({ subject, path: `${RUNS}/${runId}/chart${query}` }),
  );
  expect({ query, status }).toStrictEqual({ query, status: 200 });
  return (body as { data: Chart }).data;
}

function fillAt(params: { index: number; side: 'buy' | 'sell'; hours: number }): FillInput {
  return {
    orderKey: `order-${params.index}`,
    positionKey: `position-${params.index}`,
    candleTime: at(params.hours),
    side: params.side,
    price: '30000',
    quantity: '0.01',
    notional: '300',
    fee: '0.3',
  };
}

beforeAll(async () => {
  harness = await createRunsHarness({ candles: buildCandles() });
});

afterAll(async () => {
  await harness.stop();
});

describe('preço reduzido', () => {
  test('uma coluna por vela quando há menos velas que colunas, com as contas à mão', async () => {
    const runId = await createRunFor(SUBJECT_A, { periodEnd: at(10) });
    harness.runs.updateRun(runId, { status: 'completed', lastCandleTime: at(9) });
    const result = await chart(runId);
    expect(result).toMatchObject({ symbol: 'BTCUSDT', timeframe: '1h', from: at(0), to: at(10) });
    expect(result.columns).toHaveLength(10);
    expect(result.columns[3]).toStrictEqual({
      startTime: at(3),
      endTime: at(3),
      first: '103',
      last: '103.5',
      low: '101',
      high: '111',
    });
  });

  test('com mais velas que colunas, cada coluna junta o primeiro, o último, a mínima e a máxima', async () => {
    const runId = await createCompletedBacktest();
    const result = await chart(runId, '?columns=100');
    expect(result.columns).toHaveLength(100);
    expect(result.columns[0]).toStrictEqual({
      startTime: at(0),
      endTime: at(3),
      first: '100',
      last: '103.5',
      low: '98',
      high: '111',
    });
    expect(result.columns[99]).toStrictEqual({
      startTime: at(396),
      endTime: at(399),
      first: '496',
      last: '499.5',
      low: '494',
      high: '507',
    });
  });

  test('sem `columns` o padrão é 800 (aqui, uma por vela: 400)', async () => {
    const result = await chart(await createCompletedBacktest());
    expect(result.columns).toHaveLength(CANDLES);
  });

  test('nunca passa de `columns` colunas', async () => {
    const runId = await createCompletedBacktest();
    for (const columns of [100, 137, 399]) {
      const result = await chart(runId, `?columns=${columns}`);
      expect(result.columns.length).toBeLessThanOrEqual(columns);
    }
  });

  test('a resposta bate com o esquema documentado', async () => {
    const runId = await createCompletedBacktest();
    harness.runs.seed(runId, 'fills', [fillAt({ index: 1, side: 'buy', hours: 5 })]);
    const route = harness.routes.find((candidate) => candidate.path === `${RUNS}/:runId/chart`);
    expect(route?.access).toBe('user');
    const { body } = await readJson(
      await harness.call({ subject: SUBJECT_A, path: `${RUNS}/${runId}/chart` }),
    );
    expect(
      route?.documentation?.successes[0]?.schema?.safeParse((body as { data: Chart }).data).success,
    ).toBe(true);
  });
});

describe('faixa pedida e faixa da execução', () => {
  test('a faixa pedida é recortada à da execução', async () => {
    const runId = await createCompletedBacktest();
    const wide = await chart(runId, `?from=${at(-50)}&to=${at(900)}&columns=100`);
    expect([wide.from, wide.to]).toStrictEqual([at(0), at(CANDLES)]);
    const partial = await chart(runId, `?from=${at(100)}&to=${at(900)}&columns=100`);
    expect([partial.from, partial.to]).toStrictEqual([at(100), at(CANDLES)]);
    expect(partial.columns[0]?.startTime).toBe(at(100));
  });

  test('`to` é excluído e `from` incluído', async () => {
    const result = await chart(
      await createCompletedBacktest(),
      `?from=${at(10)}&to=${at(20)}&columns=100`,
    );
    expect(result.columns).toHaveLength(10);
    expect(result.columns[0]?.startTime).toBe(at(10));
    expect(result.columns.at(-1)?.endTime).toBe(at(19));
  });

  test('faixa sem interseção com a execução é 400 (outside_run)', async () => {
    const runId = await createCompletedBacktest();
    const response = await harness.call({
      subject: SUBJECT_A,
      path: `${RUNS}/${runId}/chart?from=${at(-20)}&to=${at(-10)}`,
    });
    const body = (await response.json()) as ErrorBody;
    expect(response.status).toBe(400);
    expect(body.error.details).toContainEqual({ field: 'from', reason: 'outside_run' });
  });

  test('execução na fila devolve listas vazias, não erro', async () => {
    const runId = await createRunFor(SUBJECT_A);
    const result = await chart(runId);
    expect(result).toMatchObject({
      columns: [],
      markers: [],
      clusters: null,
      totals: { buys: 0, sells: 0 },
      lastClosedCandleTime: null,
    });
  });
});

describe('validação', () => {
  test('`columns` fora de 100 a 2.000, não inteiro ou texto é 400', async () => {
    const runId = await createCompletedBacktest();
    for (const columns of ['99', '2001', 'abc', '1.5', '-100', '']) {
      const response = await harness.call({
        subject: SUBJECT_A,
        path: `${RUNS}/${runId}/chart?columns=${columns}`,
      });
      expect({ columns, status: response.status }).toStrictEqual({ columns, status: 400 });
    }
    for (const columns of ['100', '2000']) {
      const response = await harness.call({
        subject: SUBJECT_A,
        path: `${RUNS}/${runId}/chart?columns=${columns}`,
      });
      expect(response.status).toBe(200);
    }
  });

  test('`to` igual ou antes de `from` é 400 em `to`', async () => {
    const runId = await createCompletedBacktest();
    for (const query of [`?from=${at(5)}&to=${at(5)}`, `?from=${at(5)}&to=${at(1)}`]) {
      const response = await harness.call({
        subject: SUBJECT_A,
        path: `${RUNS}/${runId}/chart${query}`,
      });
      const body = (await response.json()) as ErrorBody;
      expect(response.status).toBe(400);
      expect(body.error.details).toContainEqual({ field: 'to', reason: 'must_be_after_from' });
    }
  });

  test('parâmetro desconhecido sozinho é 400', async () => {
    const runId = await createCompletedBacktest();
    for (const query of ['?userId=x', '?foo=1', '?limit=10']) {
      const response = await harness.call({
        subject: SUBJECT_A,
        path: `${RUNS}/${runId}/chart${query}`,
      });
      expect({ query, status: response.status }).toStrictEqual({ query, status: 400 });
    }
  });

  test('todos os erros de uma vez e nenhum eco de valor', async () => {
    const runId = await createCompletedBacktest();
    const response = await harness.call({
      subject: SUBJECT_A,
      path: `${RUNS}/${runId}/chart?from=abcsecreto&columns=zzsecreto&userId=x`,
    });
    const text = await response.text();
    expect(response.status).toBe(400);
    const fields = new Set((JSON.parse(text) as ErrorBody).error.details?.map((d) => d.field));
    expect(fields.has('from')).toBe(true);
    expect(fields.has('columns')).toBe(true);
    expect(text).not.toContain('abcsecreto');
    expect(text).not.toContain('zzsecreto');
  });
});

describe('acesso', () => {
  test('exige token', async () => {
    const runId = await createCompletedBacktest();
    expect((await harness.call({ path: `${RUNS}/${runId}/chart` })).status).toBe(401);
  });

  test('execução de outro usuário, inexistente, malformada e apagada dão o mesmo 404', async () => {
    const runId = await createCompletedBacktest();
    const missing = await harness.call({ subject: SUBJECT_B, path: `${RUNS}/${MISSING_ID}/chart` });
    await expectIndistinguishableNotFound({
      expectedCode: 'RUN_NOT_FOUND',
      foreignResourceResponse: await harness.call({
        subject: SUBJECT_B,
        path: `${RUNS}/${runId}/chart`,
      }),
      missingResourceResponse: missing,
    });
    await expectIndistinguishableNotFound({
      expectedCode: 'RUN_NOT_FOUND',
      foreignResourceResponse: await harness.call({
        subject: SUBJECT_B,
        path: `${RUNS}/xyz/chart`,
      }),
      missingResourceResponse: missing,
    });
    const deleted = await createRunFor(SUBJECT_B);
    await harness.runs.repository.transitionRun(harness.scopeOf(SUBJECT_B), {
      runId: deleted,
      to: 'cancelled',
    });
    await harness.call({ subject: SUBJECT_B, method: 'DELETE', path: `${RUNS}/${deleted}` });
    await expectIndistinguishableNotFound({
      expectedCode: 'RUN_NOT_FOUND',
      foreignResourceResponse: await harness.call({
        subject: SUBJECT_B,
        path: `${RUNS}/${deleted}/chart`,
      }),
      missingResourceResponse: missing,
    });
  });
});

describe('marcadores e agrupamentos', () => {
  async function runWithFills(count: number): Promise<string> {
    const runId = await createCompletedBacktest();
    harness.runs.seed(
      runId,
      'fills',
      Array.from({ length: count }, (_unused, index) =>
        fillAt({ index, side: index % 2 === 0 ? 'buy' : 'sell', hours: index % CANDLES }),
      ),
    );
    return runId;
  }

  test('500 preenchimentos vêm como marcadores e nenhum agrupamento', async () => {
    const runId = await runWithFills(MARKER_LIMIT);
    const before = harness.runs.chartCalls.clusters;
    const result = await chart(runId);
    expect(result.markers).toHaveLength(MARKER_LIMIT);
    expect(result.clusters).toBeNull();
    expect(result.totals).toStrictEqual({ buys: 250, sells: 250 });
    expect(harness.runs.chartCalls.clusters).toBe(before);
  });

  test('501 viram agrupamentos: a soma é `totals` e os limites são os do balde', async () => {
    const runId = await runWithFills(MARKER_LIMIT + 1);
    const markersBefore = harness.runs.chartCalls.markers;
    const result = await chart(runId, '?columns=100');
    expect(result.markers).toBeNull();
    expect(result.totals).toStrictEqual({ buys: 251, sells: 250 });
    expect(harness.runs.chartCalls.markers).toBe(markersBefore);
    const clusters = result.clusters ?? [];
    expect(clusters.reduce((sum, cluster) => sum + cluster.buys, 0)).toBe(251);
    expect(clusters.reduce((sum, cluster) => sum + cluster.sells, 0)).toBe(250);
    const expectedBuys = new Map<number, number>();
    for (let index = 0; index < MARKER_LIMIT + 1; index += 2) {
      const bucket = Math.floor((index % CANDLES) / 4);
      expectedBuys.set(bucket, (expectedBuys.get(bucket) ?? 0) + 1);
    }
    for (const cluster of clusters) {
      const bucket = (cluster.startTime - at(0)) / (4 * HOUR);
      expect(cluster.endTime - cluster.startTime).toBe(4 * HOUR);
      expect(cluster.buys).toBe(expectedBuys.get(bucket) ?? 0);
    }
  });

  test('os limites do balde quando a largura não divide: from + ceil(b * W / C)', async () => {
    const runId = await createCompletedBacktest();
    harness.runs.seed(
      runId,
      'fills',
      Array.from({ length: MARKER_LIMIT + 1 }, (_unused, index) =>
        fillAt({ index, side: 'buy', hours: index % 10 }),
      ),
    );
    const width = 10 * HOUR;
    const columns = 137;
    const result = await chart(runId, `?from=${at(0)}&to=${at(10)}&columns=${columns}`);
    const ceilDiv = (numerator: number, denominator: number): number =>
      Math.floor((numerator + denominator - 1) / denominator);
    const expected = Array.from({ length: 10 }, (_unused, hour) => {
      const bucket = Math.floor((hour * HOUR * columns) / width);
      return [
        at(0) + ceilDiv(bucket * width, columns),
        at(0) + ceilDiv((bucket + 1) * width, columns),
      ];
    });
    expect(result.clusters?.map((cluster) => [cluster.startTime, cluster.endTime])).toStrictEqual(
      expected,
    );
    for (const [index, cluster] of (result.clusters ?? []).entries()) {
      expect(cluster.startTime <= at(index) && at(index) < cluster.endTime).toBe(true);
    }
  });

  test('amount, resultado e % do marcador batem com o /trades', async () => {
    const runId = await createCompletedBacktest();
    const positions: PositionInput[] = [
      {
        engineKey: 'p1',
        status: 'closed',
        entryPrice: '30000.5',
        quantity: '0.01',
        stopPrice: '29000',
        targetPrice: '31000',
        entryFee: '0.45',
        exitPrice: '30500',
        exitFee: '0.47',
        netProfit: '9.94419753',
        exitReason: 'target',
        openedCandleTime: at(2),
        closedCandleTime: at(6),
      },
    ];
    harness.runs.seed(runId, 'positions', positions);
    harness.runs.seed(runId, 'fills', [
      {
        ...fillAt({ index: 1, side: 'buy', hours: 2 }),
        positionKey: 'p1',
        notional: '300.123456789',
        fee: '0.45',
      },
      {
        ...fillAt({ index: 2, side: 'sell', hours: 6 }),
        positionKey: 'p1',
        notional: '310.987654321',
        fee: '0.47',
      },
    ]);
    const result = await chart(runId);
    const [buy, sell] = result.markers ?? [];
    const trade = (
      (await (
        await harness.call({ subject: SUBJECT_A, path: `${RUNS}/${runId}/trades` })
      ).json()) as {
        data: Record<string, unknown>[];
      }
    ).data[0];
    expect(buy).toMatchObject({
      side: 'buy',
      candleTime: at(2),
      amount: trade?.['paid'],
      fee: '0.45',
    });
    expect('netProfit' in (buy ?? {})).toBe(false);
    expect(sell).toMatchObject({
      side: 'sell',
      candleTime: at(6),
      amount: trade?.['received'],
      netProfit: '9.94419753',
      netProfitRate: trade?.['netProfitRate'],
      price: '30000',
      quantity: '0.01',
    });
  });
});

describe('walk-forward e ao vivo', () => {
  test('walk-forward mostra só as janelas de teste: o ajuste fica fora das colunas', async () => {
    const runId = await createRunFor(SUBJECT_A, { kind: 'walk_forward' });
    const windows: WalkForwardWindowInput[] = [
      {
        windowIndex: 0,
        trainStart: at(0),
        trainEnd: at(100),
        testStart: at(100),
        testEnd: at(150),
      },
      {
        windowIndex: 1,
        trainStart: at(50),
        trainEnd: at(150),
        testStart: at(150),
        testEnd: at(200),
      },
    ].map((window) => ({
      ...window,
      bestParams: undefined,
      status: 'ok' as const,
      inSample: {},
      outOfSample: {},
      eligibleCombinations: 1,
    }));
    harness.runs.seed(runId, 'windows', windows);
    harness.runs.seed(runId, 'fills', [
      fillAt({ index: 1, side: 'buy', hours: 110 }),
      fillAt({ index: 2, side: 'sell', hours: 120 }),
    ]);
    const result = await chart(runId, '?columns=100');
    expect([result.from, result.to]).toStrictEqual([at(100), at(200)]);
    expect(result.columns[0]?.startTime).toBe(at(100));
    expect(result.columns.at(-1)?.endTime).toBe(at(199));
    expect(result.totals).toStrictEqual({ buys: 1, sells: 1 });
  });

  test('ao vivo para na última vela processada: a gravada depois dela não aparece', async () => {
    const runId = await createRunFor(SUBJECT_A, { kind: 'live_paper', periodEnd: undefined });
    harness.runs.updateRun(runId, { status: 'running', lastCandleTime: at(50) });
    const result = await chart(runId, '?columns=100');
    expect([result.from, result.to]).toStrictEqual([at(0), at(51)]);
    expect(result.lastClosedCandleTime).toBe(at(50));
    expect(result.columns.at(-1)?.endTime).toBe(at(50));
    harness.runs.updateRun(runId, { lastCandleTime: at(60) });
    expect((await chart(runId, '?columns=100')).columns.at(-1)?.endTime).toBe(at(60));
  });

  test('ao vivo sem nenhuma vela processada devolve listas vazias', async () => {
    const runId = await createRunFor(SUBJECT_A, { kind: 'live_paper', periodEnd: undefined });
    const result = await chart(runId);
    expect(result).toMatchObject({ columns: [], markers: [], lastClosedCandleTime: null });
  });
});
