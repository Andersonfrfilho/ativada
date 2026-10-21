// Copyright (c) 2026 Ada Technology. All rights reserved.
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';

import {
  createRunsHarness,
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
  seedDecisions,
  type ClassicVotes,
} from './fixtures/live-status/live-status-scenario.fixture.js';
import { expectIndistinguishableNotFound } from './fixtures/not-found-response.fixture.js';

const RUNS = '/v1/runs';
const DECISIONS_PATH = '/decisions';
const COUNT = 30;
const VOTES: ClassicVotes = [1, -1, 0, 1];
const BUY_VOTES: ClassicVotes = [1, 1, 1, 1];

type DecisionItem = {
  candleTime: number;
  outcome: string;
  action: string;
  votes: { ruleId: string; reading: Record<string, string> | null }[];
};
type Page = { data: DecisionItem[]; pagination: { nextCursor: string | null; perPage: number } };

let harness: RunsHarness;

beforeAll(async () => {
  harness = await createRunsHarness({ candles: CLASSIC_CANDLES });
});

afterAll(async () => {
  await harness.stop();
});

type SeedRows = Parameters<typeof seedDecisions>[2];

function rows(finalVotes: ClassicVotes): SeedRows {
  return Array.from({ length: COUNT }, (_unused, index) => ({
    signal: decisionRow(index, index === COUNT - 1 ? finalVotes : VOTES),
    equity: equityRow(index, '1000', '1000'),
  }));
}

async function seedRun(
  kind: 'live_paper' | 'backtest' | 'walk_forward',
  votes: ClassicVotes = VOTES,
): Promise<string> {
  const runId = await createLiveRun(harness, {
    subject: SUBJECT_A,
    kind,
    status: kind === 'live_paper' ? 'running' : 'completed',
  });
  seedDecisions(harness, runId, rows(votes));
  return runId;
}

async function readDecisions(
  runId: string,
  query = '',
): Promise<{ status: number; body: unknown }> {
  const response = await harness.call({
    subject: SUBJECT_A,
    path: `${RUNS}/${runId}${DECISIONS_PATH}${query}`,
  });
  return readJson(response);
}

describe('decisões por vela de backtest e walk-forward concluídos', () => {
  test.each(['backtest', 'walk_forward'] as const)(
    '%s: a primeira página traz as 24 mais novas, com voto e leitura de cada regra',
    async (kind) => {
      const runId = await seedRun(kind);
      const result = await readDecisions(runId);
      const page = result.body as Page;
      expect(result.status).toBe(200);
      expect(page.data).toHaveLength(24);
      expect(page.data[0]?.candleTime).toBe(at(COUNT - 1));
      expect(page.pagination.perPage).toBe(24);
      expect(page.data[0]?.votes.map((vote) => vote.ruleId)).toStrictEqual([
        'ema-9-21',
        'macd-12-26-9',
        'rsi-14',
        'obv-ema-20',
      ]);
      expect(page.data[0]?.votes[0]?.reading).not.toBeNull();
    },
  );

  test('as linhas do backtest são as mesmas do ao vivo (mesmas frases fechadas)', async () => {
    const live = (await readDecisions(await seedRun('live_paper'))).body as Page;
    const backtest = (await readDecisions(await seedRun('backtest'))).body as Page;
    expect(backtest.data.slice(1)).toStrictEqual(live.data.slice(1));
  });

  test('na última vela, a compra que não teve vela seguinte não fica "pendente" no histórico', async () => {
    const live = (await readDecisions(await seedRun('live_paper', BUY_VOTES))).body as Page;
    const backtest = (await readDecisions(await seedRun('backtest', BUY_VOTES))).body as Page;
    expect(live.data[0]?.action).toBe('BUY');
    expect(live.data[0]?.outcome).toBe('buy_pending');
    expect(backtest.data[0]?.action).toBe('BUY');
    expect(backtest.data[0]?.outcome).not.toBe('buy_pending');
  });

  test('at: a página começa na vela pedida (inclusive) e segue para as anteriores', async () => {
    const runId = await seedRun('backtest');
    const result = await readDecisions(runId, `?at=${at(10)}&limit=3`);
    const page = result.body as Page;
    expect(result.status).toBe(200);
    expect(page.data.map((item) => item.candleTime)).toStrictEqual([at(10), at(9), at(8)]);
  });

  test('at em vela sem decisão devolve a anterior mais próxima, e antes da primeira, nada', async () => {
    const runId = await seedRun('backtest');
    const between = (await readDecisions(runId, `?at=${at(10) + 1}&limit=1`)).body as Page;
    expect(between.data.map((item) => item.candleTime)).toStrictEqual([at(10)]);
    const before = (await readDecisions(runId, `?at=${at(0) - 1}&limit=1`)).body as Page;
    expect(before.data).toStrictEqual([]);
  });

  test('at junto com cursor, ou malformado, é 400', async () => {
    const runId = await seedRun('backtest');
    const first = (await readDecisions(runId, '?limit=2')).body as Page;
    const cursor = first.pagination.nextCursor ?? '';
    for (const query of [`?at=${at(3)}&cursor=${cursor}`, '?at=abc', '?at=-1', '?at=1.5', '?at=']) {
      const result = await readDecisions(runId, query);
      expect({ query, status: result.status }).toStrictEqual({ query, status: 400 });
    }
  });

  test('execução de outro usuário, inexistente ou apagada: o mesmo 404, backtest incluído', async () => {
    const runId = await seedRun('backtest');
    const missing = await harness.call({
      subject: SUBJECT_B,
      path: `${RUNS}/00000000-0000-4000-8000-000000000000${DECISIONS_PATH}`,
    });
    await expectIndistinguishableNotFound({
      expectedCode: 'RUN_NOT_FOUND',
      foreignResourceResponse: await harness.call({
        subject: SUBJECT_B,
        path: `${RUNS}/${runId}${DECISIONS_PATH}?at=${at(3)}`,
      }),
      missingResourceResponse: missing,
    });
  });
});
