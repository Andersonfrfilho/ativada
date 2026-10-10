// Copyright (c) 2026 Ada Technology. All rights reserved.
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';

import type {
  EquityPointInput,
  FillInput,
  OrderInput,
  PositionInput,
  SignalInput,
  WalkForwardWindowInput,
} from '../packages/database/src/index.js';
import { expectIndistinguishableNotFound } from './fixtures/not-found-response.fixture.js';
import {
  createRunsHarness,
  HOUR,
  MISSING_ID,
  readJson,
  SUBJECT_A,
  SUBJECT_B,
  type RunsHarness,
} from './fixtures/api-routes/runs-harness.fixture.js';
import type { ResultKind } from './fixtures/api-routes/in-memory-runs.fixture.js';

const RUNS = '/v1/runs';
const FIRST = Date.UTC(2025, 0, 1);
const ROWS = 7;

let harness: RunsHarness;
let runId: string;

type Page = {
  data: Record<string, unknown>[];
  pagination: { nextCursor: string | null; perPage: number };
};

const SERIES: readonly {
  readonly name: string;
  readonly segment: string;
  readonly kind: ResultKind;
}[] = [
  { name: 'patrimônio', segment: 'equity', kind: 'equity' },
  { name: 'operações', segment: 'trades', kind: 'positions' },
  { name: 'sinais', segment: 'signals', kind: 'signals' },
  { name: 'ordens', segment: 'orders', kind: 'orders' },
  { name: 'preenchimentos', segment: 'fills', kind: 'fills' },
  { name: 'janelas', segment: 'windows', kind: 'windows' },
];

function equityRows(): EquityPointInput[] {
  return Array.from({ length: ROWS }, (_u, i) => ({
    candleTime: FIRST + i * HOUR,
    equity: `${10_000 + i}.5`,
    equityAtLow: `${9_990 + i}.25`,
    benchmark: `${10_000 - i}`,
  }));
}

function positionRows(): PositionInput[] {
  return Array.from({ length: ROWS }, (_u, i) => ({
    engineKey: `position-${i}`,
    status: i === ROWS - 1 ? ('open' as const) : ('closed' as const),
    entryPrice: '30000.5',
    quantity: '0.01',
    stopPrice: '29000',
    targetPrice: '31000',
    entryFee: '0.3',
    exitPrice: i === ROWS - 1 ? undefined : '30500',
    exitFee: i === ROWS - 1 ? undefined : '0.3',
    netProfit: i === ROWS - 1 ? undefined : `-${i}.5`,
    exitReason: i === ROWS - 1 ? undefined : ('target' as const),
    openedCandleTime: FIRST + i * HOUR,
    closedCandleTime: i === ROWS - 1 ? undefined : FIRST + (i + 1) * HOUR,
  }));
}

function signalRows(): SignalInput[] {
  return Array.from({ length: ROWS }, (_u, i) => ({
    candleTime: FIRST + i * HOUR,
    action: 'BUY' as const,
    score: '2.5',
    regime: 'trending' as const,
    votes: [{ ruleId: 'ema', vote: 1 }],
    indicators: { 'rule:ema': 100.5 },
    sentimentObservation: undefined,
    reason: `Compra ${i}`,
  }));
}

function orderRows(): OrderInput[] {
  return Array.from({ length: ROWS }, (_u, i) => ({
    engineKey: `order-${i}`,
    side: 'buy' as const,
    type: 'market' as const,
    purpose: 'entry' as const,
    status: 'filled' as const,
    reason: undefined,
    quantity: '0.01',
    price: '30000',
    limitPrice: undefined,
    triggerPrice: undefined,
    riskAmount: '100',
    stopDistance: '1000',
    targetDistance: '1500',
    eligibleCandles: undefined,
    createdCandleTime: FIRST,
    expiresCandleTime: undefined,
    lastEventCandleTime: FIRST + HOUR,
  }));
}

function fillRows(): FillInput[] {
  return Array.from({ length: ROWS }, (_u, i) => ({
    orderKey: `order-${i}`,
    positionKey: `position-${i}`,
    candleTime: FIRST + HOUR,
    side: 'buy' as const,
    price: '30000',
    quantity: '0.01',
    notional: '300',
    fee: '0.3',
  }));
}

function windowRows(): WalkForwardWindowInput[] {
  return Array.from({ length: ROWS }, (_u, i) => ({
    windowIndex: i,
    trainStart: FIRST,
    trainEnd: FIRST + 10 * HOUR,
    testStart: FIRST + 10 * HOUR,
    testEnd: FIRST + 20 * HOUR,
    bestParams: { combinationIndex: i, assignment: [] },
    status: 'ok' as const,
    inSample: { sharpe: '1' },
    outOfSample: { sharpe: '0.5' },
    eligibleCombinations: 3,
  }));
}

beforeAll(async () => {
  harness = await createRunsHarness();
  const seeded = await harness.seedStrategy(SUBJECT_A, 'series');
  const created = await harness.runs.repository.createRun(harness.scopeOf(SUBJECT_A), {
    strategyVersionId: seeded.versionId,
    kind: 'backtest',
    symbol: 'BTCUSDT',
    timeframe: '1h',
    runParameters: { symbol: 'BTCUSDT' },
    runHash: 'h'.repeat(64),
    engineVersion: 'engine-2',
    signalEngineVersion: 'signal-2',
    metricsVersion: 'metrics-1',
    periodStart: FIRST,
    periodEnd: FIRST + 100 * HOUR,
    migratedFromRunId: undefined,
  });
  if (created === undefined) throw new Error('execução semente não criada');
  runId = created.id;
  harness.runs.seed(runId, 'equity', equityRows());
  harness.runs.seed(runId, 'positions', positionRows());
  harness.runs.seed(runId, 'signals', signalRows());
  harness.runs.seed(runId, 'orders', orderRows());
  harness.runs.seed(runId, 'fills', fillRows());
  harness.runs.seed(runId, 'windows', windowRows());
});

afterAll(async () => {
  await harness.stop();
});

describe.each([...SERIES])('GET /v1/runs/:id/$segment ($name)', ({ segment, kind }) => {
  const path = (query = ''): string => `${RUNS}/${runId}/${segment}${query}`;

  test('exige token', async () => {
    expect((await harness.call({ path: path() })).status).toBe(401);
  });

  test('percorre a série inteira por cursor, sem repetir nem pular linha', async () => {
    const seen: string[] = [];
    let cursor: string | null = null;
    do {
      const query: string =
        cursor === null ? '?limit=3' : `?limit=3&cursor=${encodeURIComponent(cursor)}`;
      const { status, body } = await readJson(
        await harness.call({ subject: SUBJECT_A, path: path(query) }),
      );
      const page = body as Page;
      expect(status).toBe(200);
      expect(page.pagination.perPage).toBe(3);
      seen.push(...page.data.map((row) => JSON.stringify(row)));
      cursor = page.pagination.nextCursor;
    } while (cursor !== null);
    expect(seen).toHaveLength(ROWS);
    expect(new Set(seen).size).toBe(ROWS);
  });

  test('lê só uma página do repositório por chamada (nunca a série inteira em memória)', async () => {
    const before = harness.runs.listCalls[kind].length;
    await harness.call({ subject: SUBJECT_A, path: path('?limit=2') });
    expect(harness.runs.listCalls[kind].slice(before)).toStrictEqual([2]);
  });

  test('limit acima de 100, cursor adulterado e parâmetro desconhecido são 400', async () => {
    for (const query of ['?limit=101', '?cursor=bm90LWpzb24', '?userId=x', '?limit=-1']) {
      const response = await harness.call({ subject: SUBJECT_A, path: path(query) });
      expect({ query, status: response.status }).toStrictEqual({ query, status: 400 });
    }
    expect((await harness.call({ subject: SUBJECT_A, path: path('?limit=100') })).status).toBe(200);
  });

  test('cada linha bate com o esquema documentado (sem campo a mais nem a menos)', async () => {
    const route = harness.routes.find((r) => r.path === `${RUNS}/:runId/${segment}`);
    const { body } = await readJson(await harness.call({ subject: SUBJECT_A, path: path() }));
    const result = route?.documentation?.successes[0]?.schema?.safeParse((body as Page).data);
    expect(result?.success).toBe(true);
  });

  test('B recebe o mesmo 404 RUN_NOT_FOUND do inexistente; id malformado também', async () => {
    const foreign = await harness.call({ subject: SUBJECT_B, path: path() });
    const missing = await harness.call({
      subject: SUBJECT_B,
      path: `${RUNS}/${MISSING_ID}/${segment}`,
    });
    await expectIndistinguishableNotFound({
      expectedCode: 'RUN_NOT_FOUND',
      foreignResourceResponse: foreign,
      missingResourceResponse: missing,
    });
    const malformed = await harness.call({ subject: SUBJECT_B, path: `${RUNS}/xyz/${segment}` });
    await expectIndistinguishableNotFound({
      expectedCode: 'RUN_NOT_FOUND',
      foreignResourceResponse: malformed,
      missingResourceResponse: await harness.call({
        subject: SUBJECT_B,
        path: `${RUNS}/${MISSING_ID}/${segment}`,
      }),
    });
  });
});

describe('séries sem linhas', () => {
  test('execução própria sem resultados devolve lista vazia (inclusive janelas de um backtest)', async () => {
    const empty = await harness.seedStrategy(SUBJECT_B, 'vazia');
    const created = await harness.runs.repository.createRun(harness.scopeOf(SUBJECT_B), {
      strategyVersionId: empty.versionId,
      kind: 'backtest',
      symbol: 'BTCUSDT',
      timeframe: '1h',
      runParameters: { symbol: 'BTCUSDT' },
      runHash: 'h'.repeat(64),
      engineVersion: 'engine-2',
      signalEngineVersion: 'signal-2',
      metricsVersion: 'metrics-1',
      periodStart: FIRST,
      periodEnd: FIRST + 100 * HOUR,
      migratedFromRunId: undefined,
    });
    const { status, body } = await readJson(
      await harness.call({ subject: SUBJECT_B, path: `${RUNS}/${created?.id ?? ''}/windows` }),
    );
    expect(status).toBe(200);
    expect(body).toStrictEqual({ data: [], pagination: { nextCursor: null, perPage: 50 } });
  });
});
