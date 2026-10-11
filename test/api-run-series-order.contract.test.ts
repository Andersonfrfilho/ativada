// Copyright (c) 2026 Ada Technology. All rights reserved.
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';

import type { EquityPointInput, SignalInput } from '../packages/database/src/index.js';
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

const RUNS = '/v1/runs';
const FIRST = Date.UTC(2025, 0, 1);
const ROWS = 7;
const ORDERABLE = ['equity', 'signals'] as const;
const ASCENDING_ONLY = ['trades', 'orders', 'fills', 'windows'] as const;

let harness: RunsHarness;
let runId: string;

type Page = {
  data: { candleTime: number }[];
  pagination: { nextCursor: string | null; perPage: number };
};

function equityRows(): EquityPointInput[] {
  return Array.from({ length: ROWS }, (_u, i) => ({
    candleTime: FIRST + i * HOUR,
    equity: `${10_000 + i}.5`,
    equityAtLow: `${9_990 + i}.25`,
    benchmark: `${10_000 - i}`,
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

beforeAll(async () => {
  harness = await createRunsHarness();
  const seeded = await harness.seedStrategy(SUBJECT_A, 'ordem');
  const created = await harness.runs.repository.createRun(harness.scopeOf(SUBJECT_A), {
    strategyVersionId: seeded.versionId,
    kind: 'live_paper',
    symbol: 'BTCUSDT',
    timeframe: '1h',
    runParameters: { symbol: 'BTCUSDT' },
    runHash: 'h'.repeat(64),
    engineVersion: 'engine-2',
    signalEngineVersion: 'signal-2',
    metricsVersion: 'metrics-1',
    periodStart: FIRST,
    periodEnd: undefined,
    migratedFromRunId: undefined,
  });
  if (created === undefined) throw new Error('execução semente não criada');
  runId = created.id;
  harness.runs.seed(runId, 'equity', equityRows());
  harness.runs.seed(runId, 'signals', signalRows());
});

afterAll(async () => {
  await harness.stop();
});

async function readPage(segment: string, query: string): Promise<{ status: number; page: Page }> {
  const { status, body } = await readJson(
    await harness.call({ subject: SUBJECT_A, path: `${RUNS}/${runId}/${segment}${query}` }),
  );
  return { status, page: body as Page };
}

describe.each([...ORDERABLE])('GET /v1/runs/:id/%s?order=desc', (segment) => {
  test('a primeira página já é a mais recente', async () => {
    const { status, page } = await readPage(segment, '?order=desc&limit=2');
    expect(status).toBe(200);
    expect(page.data.map((row) => row.candleTime)).toStrictEqual([
      FIRST + 6 * HOUR,
      FIRST + 5 * HOUR,
    ]);
    expect(page.pagination.nextCursor).not.toBeNull();
  });

  test('percorre a série inteira do fim para o começo, sem repetir nem pular linha', async () => {
    const seen: number[] = [];
    let cursor: string | null = null;
    do {
      const query: string =
        cursor === null
          ? '?order=desc&limit=3'
          : `?order=desc&limit=3&cursor=${encodeURIComponent(cursor)}`;
      const { page } = await readPage(segment, query);
      seen.push(...page.data.map((row) => row.candleTime));
      cursor = page.pagination.nextCursor;
    } while (cursor !== null);
    expect(seen).toStrictEqual(
      Array.from({ length: ROWS }, (_u, i) => FIRST + (ROWS - 1 - i) * HOUR),
    );
  });

  test('order=asc é igual a omitir o parâmetro', async () => {
    const explicit = await readPage(segment, '?order=asc&limit=4');
    const implicit = await readPage(segment, '?limit=4');
    expect(explicit.page).toStrictEqual(implicit.page);
    expect(explicit.page.data[0]?.candleTime).toBe(FIRST);
  });

  test('valor de order desconhecido é 400', async () => {
    for (const query of ['?order=sideways', '?order=', '?order=DESC']) {
      expect((await readPage(segment, query)).status).toBe(400);
    }
  });

  test('lê só uma página do repositório por chamada', async () => {
    const kind = segment === 'equity' ? 'equity' : 'signals';
    const before = harness.runs.listCalls[kind].length;
    await readPage(segment, '?order=desc&limit=2');
    expect(harness.runs.listCalls[kind].slice(before)).toStrictEqual([2]);
  });

  test('B recebe o mesmo 404 do inexistente, também com order=desc', async () => {
    const foreign = await harness.call({
      subject: SUBJECT_B,
      path: `${RUNS}/${runId}/${segment}?order=desc`,
    });
    const missing = await harness.call({
      subject: SUBJECT_B,
      path: `${RUNS}/${MISSING_ID}/${segment}?order=desc`,
    });
    await expectIndistinguishableNotFound({
      expectedCode: 'RUN_NOT_FOUND',
      foreignResourceResponse: foreign,
      missingResourceResponse: missing,
    });
  });
});

describe.each([...ASCENDING_ONLY])('GET /v1/runs/:id/%s não aceita order', (segment) => {
  test('?order=desc é 400', async () => {
    expect((await readPage(segment, '?order=desc')).status).toBe(400);
  });
});
