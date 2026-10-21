// Copyright (c) 2026 Ada Technology. All rights reserved.
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';

import type { FillInput } from '../packages/database/src/index.js';
import {
  createRunsHarness,
  HOUR,
  readJson,
  SUBJECT_A,
  SUBJECT_B,
  type RunsHarness,
} from './fixtures/api-routes/runs-harness.fixture.js';
import {
  at,
  CLASSIC_CANDLES,
  createLiveRun,
  decisionRow,
  equityRow,
  PERIOD_START,
  seedDecisions,
  type ClassicVotes,
} from './fixtures/live-status/live-status-scenario.fixture.js';

const LIVE_SUMMARY_PATH = '/v1/runs/live-summary';
const FLAT_VOTES: ClassicVotes = [1, -1, 0, 1];

type SummaryItem = {
  runId: string;
  strategyName: string;
  analystMode: string | null;
  initialBalance: string;
  balance: string;
  result: string;
  resultRate: string;
  buyAndHold: { resultRate: string; differencePoints: string; comparison: string } | null;
  buyCount: number;
  sellCount: number;
  lastDecisionAt: number | null;
  isWaitingForData: boolean;
};

let harness: RunsHarness;

beforeAll(async () => {
  harness = await createRunsHarness({ candles: CLASSIC_CANDLES });
});

beforeEach(() => {
  harness.runs.purgeAll();
});

afterAll(async () => {
  await harness.stop();
});

async function summaryOf(subject: string): Promise<SummaryItem[]> {
  const { status, body } = await readJson(await harness.call({ subject, path: LIVE_SUMMARY_PATH }));
  expect(status).toBe(200);
  return (body as { data: { items: SummaryItem[] } }).data.items;
}

function fill(side: 'buy' | 'sell', key: string, index: number): FillInput {
  return {
    orderKey: `${key}-${side}`,
    positionKey: key,
    candleTime: at(index),
    side,
    price: '30000',
    quantity: '0.01',
    notional: '300',
    fee: '0.3',
  };
}

async function createTradedRun(subject: string): Promise<string> {
  const runId = await createLiveRun(harness, { subject });
  seedDecisions(harness, runId, [
    { signal: decisionRow(0, FLAT_VOTES), equity: equityRow(0, '1000', '1000') },
    { signal: decisionRow(1, FLAT_VOTES), equity: equityRow(1, '1023.4', '1010') },
  ]);
  harness.runs.seed(runId, 'fills', [
    fill('buy', 'p1', 0),
    fill('sell', 'p1', 1),
    fill('buy', 'p2', 1),
  ]);
  return runId;
}

describe('GET /v1/runs/live-summary', () => {
  test('resume o saldo, a comparação, as compras e vendas e a última decisão de cada simulação', async () => {
    const runId = await createTradedRun(SUBJECT_A);
    const [item] = await summaryOf(SUBJECT_A);
    expect(item).toStrictEqual({
      runId,
      strategyName: item?.strategyName ?? '',
      analystMode: null,
      initialBalance: '1000',
      balance: '1023.4',
      result: '23.4',
      resultRate: '0.0234',
      buyAndHold: { resultRate: '0.01', differencePoints: '1.34', comparison: 'above' },
      buyCount: 2,
      sellCount: 1,
      lastDecisionAt: at(1) + HOUR,
      isWaitingForData: false,
    });
    expect(item?.strategyName).toStartWith('Estratégia ');
  });

  test('simulação sem vela fechada mostra o saldo inicial, sem comparação nem decisão', async () => {
    await createLiveRun(harness, { subject: SUBJECT_A });
    const [item] = await summaryOf(SUBJECT_A);
    expect(item).toMatchObject({
      balance: '1000',
      result: '0',
      resultRate: '0',
      buyAndHold: null,
      buyCount: 0,
      sellCount: 0,
      lastDecisionAt: null,
    });
  });

  test('traz todas as ativas, da mais recente para a mais antiga, e só as ativas', async () => {
    const first = await createLiveRun(harness, { subject: SUBJECT_A });
    const second = await createLiveRun(harness, { subject: SUBJECT_A, status: 'queued' });
    await createLiveRun(harness, { subject: SUBJECT_A, status: 'completed' });
    await createLiveRun(harness, { subject: SUBJECT_A, kind: 'backtest', status: 'running' });
    const items = await summaryOf(SUBJECT_A);
    expect(items.map((item) => item.runId)).toStrictEqual([second, first]);
  });

  test('a simulação com analista aparece com o modo dele', async () => {
    const seeded = await harness.seedStrategy(SUBJECT_A, 'analista');
    const created = await harness.runs.repository.createRun(harness.scopeOf(SUBJECT_A), {
      strategyVersionId: seeded.versionId,
      kind: 'live_paper',
      symbol: 'BTCUSDT',
      timeframe: '15m',
      runParameters: { symbol: 'BTCUSDT', initialBalance: '500' },
      runHash: 'h'.repeat(64),
      engineVersion: 'engine-2',
      signalEngineVersion: 'signal-2',
      metricsVersion: 'metrics-1',
      periodStart: PERIOD_START,
      periodEnd: undefined,
      migratedFromRunId: undefined,
      request: { analyst: { version: 'analyst-1', mode: 'govern' } },
    });
    if (created === undefined) throw new Error('execução semente não criada');
    harness.runs.updateRun(created.id, { status: 'running' });
    const [item] = await summaryOf(SUBJECT_A);
    expect(item).toMatchObject({ analystMode: 'govern', initialBalance: '500', balance: '500' });
  });

  test('uma ida só ao banco, qualquer que seja o número de simulações', async () => {
    for (let count = 0; count < 5; count += 1) await createTradedRun(SUBJECT_A);
    harness.queries.length = 0;
    expect(await summaryOf(SUBJECT_A)).toHaveLength(5);
    expect(harness.queries).toStrictEqual(['listLiveSummaries']);
  });

  test('simulação de outro usuário nunca aparece', async () => {
    await createTradedRun(SUBJECT_B);
    expect(await summaryOf(SUBJECT_A)).toStrictEqual([]);
    expect(await summaryOf(SUBJECT_B)).toHaveLength(1);
  });

  test('parâmetro desconhecido na consulta é 400', async () => {
    const { status } = await readJson(
      await harness.call({ subject: SUBJECT_A, path: `${LIVE_SUMMARY_PATH}?foo=1` }),
    );
    expect(status).toBe(400);
  });

  test('sem token é 401', async () => {
    expect((await harness.call({ path: LIVE_SUMMARY_PATH })).status).toBe(401);
  });
});
