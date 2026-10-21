// Copyright (c) 2026 Ada Technology. All rights reserved.
import { afterAll, beforeAll, describe, expect, spyOn, test } from 'bun:test';

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
  positionRow,
  seedDecisions,
  type ClassicVotes,
} from './fixtures/live-status/live-status-scenario.fixture.js';

const RUNS = '/v1/runs';
const DECISIONS = 30;
const WAITING_VOTES: ClassicVotes = [1, -1, 0, 1];
const BOUGHT_VOTES: ClassicVotes = [1, 1, 1, 0];
const SOLD_VOTES: ClassicVotes = [-1, -1, -1, 0];

type ChartDecision = {
  candleTime: number;
  closedAt: number;
  action: string;
  outcome: string;
  score: string;
  scoreThreshold: string;
};
type Chart = {
  from: number;
  to: number;
  runRange: { from: number; to: number };
  decisions: ChartDecision[] | null;
  markers: unknown[] | null;
};

let harness: RunsHarness;

beforeAll(async () => {
  harness = await createRunsHarness({ candles: CLASSIC_CANDLES });
});

afterAll(async () => {
  await harness.stop();
});

async function chartOf(runId: string, query = '', subject = SUBJECT_A): Promise<Chart> {
  const { status, body } = await readJson(
    await harness.call({ subject, path: `${RUNS}/${runId}/chart${query}` }),
  );
  expect(status).toBe(200);
  return (body as { data: Chart }).data;
}

async function createRunWithDecisions(): Promise<string> {
  const runId = await createLiveRun(harness, { subject: SUBJECT_A });
  const rows = Array.from({ length: DECISIONS }, (_unused, index) => {
    const votes =
      index === 4 || index === 20 ? BOUGHT_VOTES : index === 7 ? SOLD_VOTES : WAITING_VOTES;
    return { signal: decisionRow(index, votes), equity: equityRow(index, '1000', '1000') };
  });
  seedDecisions(harness, runId, rows);
  harness.runs.seed(runId, 'positions', [
    positionRow({ key: 'p1', openedIndex: 5, closedIndex: 8 }),
    positionRow({ key: 'p2', openedIndex: 21, closedIndex: undefined }),
  ]);
  return runId;
}

describe('decisões no /chart da simulação ao vivo (spec 008, RF15)', () => {
  test('uma decisão por vela da faixa, crescente, com a dica do pontinho: pontuação contra o limiar', async () => {
    const chart = await chartOf(await createRunWithDecisions());
    expect(chart.runRange).toStrictEqual({ from: PERIOD_START, to: at(DECISIONS - 1) + HOUR });
    const decisions = chart.decisions ?? [];
    expect(decisions.map((item) => item.candleTime)).toStrictEqual(
      Array.from({ length: DECISIONS - 1 }, (_unused, offset) => at(offset + 1)),
    );
    expect(decisions[0]).toStrictEqual({
      candleTime: at(1),
      closedAt: at(1) + HOUR,
      action: 'HOLD',
      outcome: 'waited',
      score: '1',
      scoreThreshold: '2',
    });
  });

  test('compra, venda e espera comprada: a ação, o desfecho e o limiar que valia naquela vela', async () => {
    const chart = await chartOf(await createRunWithDecisions());
    const byTime = new Map((chart.decisions ?? []).map((item) => [item.candleTime, item]));
    expect(byTime.get(at(4))).toMatchObject({
      action: 'BUY',
      outcome: 'bought',
      score: '2.5',
      scoreThreshold: '2',
    });
    expect(byTime.get(at(6))).toMatchObject({
      action: 'HOLD',
      outcome: 'waited',
      scoreThreshold: '-2',
    });
    expect(byTime.get(at(7))).toMatchObject({
      action: 'SELL',
      outcome: 'sold',
      score: '-2.5',
      scoreThreshold: '-2',
    });
    expect(byTime.get(at(9))).toMatchObject({ outcome: 'waited', scoreThreshold: '2' });
    expect(byTime.get(at(25))).toMatchObject({ outcome: 'waited', scoreThreshold: '-2' });
  });

  test('faixa pedida: só as velas dela, [from, to)', async () => {
    const runId = await createRunWithDecisions();
    const chart = await chartOf(runId, `?from=${at(10)}&to=${at(13)}`);
    expect((chart.decisions ?? []).map((item) => item.candleTime)).toStrictEqual([
      at(10),
      at(11),
      at(12),
    ]);
  });

  test('antes da primeira vela fechada a lista é vazia, não nula', async () => {
    const runId = await createLiveRun(harness, { subject: SUBJECT_A });
    const chart = await chartOf(runId);
    expect(chart.decisions).toStrictEqual([]);
  });

  test('o contrato novo bate com o esquema documentado', async () => {
    const runId = await createRunWithDecisions();
    const route = harness.routes.find((candidate) => candidate.path === `${RUNS}/:runId/chart`);
    const { body } = await readJson(
      await harness.call({ subject: SUBJECT_A, path: `${RUNS}/${runId}/chart` }),
    );
    expect(
      route?.documentation?.successes[0]?.schema?.safeParse((body as { data: unknown }).data)
        .success,
    ).toBe(true);
  });

  test('outro usuário continua recebendo o mesmo 404 e nunca as decisões', async () => {
    const runId = await createRunWithDecisions();
    const response = await harness.call({ subject: SUBJECT_B, path: `${RUNS}/${runId}/chart` });
    expect(response.status).toBe(404);
    expect(await response.text()).not.toContain('decisions');
  });
});

describe('o teto de 500 velas', () => {
  async function createLongRun(): Promise<string> {
    const runId = await createRunWithDecisions();
    harness.runs.updateRun(runId, { lastCandleTime: PERIOD_START + 700 * HOUR });
    return runId;
  }

  test('500 velas na faixa ainda trazem as decisões; 501 viram null', async () => {
    const runId = await createLongRun();
    const inside = await chartOf(runId, `?from=${PERIOD_START}&to=${PERIOD_START + 500 * HOUR}`);
    expect(Array.isArray(inside.decisions)).toBe(true);
    const outside = await chartOf(runId, `?from=${PERIOD_START}&to=${PERIOD_START + 501 * HOUR}`);
    expect(outside.decisions).toBeNull();
  });

  test('a conta é por (to − from) ÷ duração: 500 velas e 1 ms já passam do teto', async () => {
    const runId = await createLongRun();
    const chart = await chartOf(runId, `?from=${PERIOD_START}&to=${PERIOD_START + 500 * HOUR + 1}`);
    expect(chart.decisions).toBeNull();
  });

  test('dado sujo: mais de 500 decisões numa faixa de poucas velas também vira null, nunca 501 pontinhos', async () => {
    const runId = await createLiveRun(harness, { subject: SUBJECT_A });
    const rows = Array.from({ length: 501 }, (_unused, index) => ({
      signal: { ...decisionRow(1, WAITING_VOTES), candleTime: PERIOD_START + index * 60_000 },
      equity: equityRow(1, '1000', '1000'),
    }));
    seedDecisions(harness, runId, rows);
    harness.runs.updateRun(runId, { lastCandleTime: PERIOD_START + 100 * HOUR });
    const dirty = await chartOf(runId, `?from=${PERIOD_START}&to=${PERIOD_START + 100 * HOUR}`);
    expect(dirty.decisions).toBeNull();
    const clean = await chartOf(runId, `?from=${PERIOD_START}&to=${PERIOD_START + 5 * HOUR}`);
    expect(clean.decisions).toHaveLength(300);
  });

  test('acima do teto o banco nem é consultado para as decisões', async () => {
    const runId = await createLongRun();
    harness.queries.length = 0;
    await chartOf(runId, `?from=${PERIOD_START}&to=${PERIOD_START + 600 * HOUR}`);
    expect(harness.queries).not.toContain('listDecisionMarkers');
    expect(harness.queries).not.toContain('listPositionsAround');
    harness.queries.length = 0;
    await chartOf(runId, `?from=${PERIOD_START}&to=${PERIOD_START + 10 * HOUR}`);
    expect(harness.queries.filter((name) => name === 'listDecisionMarkers')).toHaveLength(1);
    expect(harness.queries.filter((name) => name === 'listPositionsAround')).toHaveLength(1);
  });
});

describe('backtest e walk-forward não mudam', () => {
  test.each(['backtest', 'walk_forward'] as const)('%s: decisions é null', async (kind) => {
    const runId = await createLiveRun(harness, { subject: SUBJECT_A, kind, status: 'completed' });
    seedDecisions(
      harness,
      runId,
      Array.from({ length: 5 }, (_unused, index) => ({
        signal: decisionRow(index, WAITING_VOTES),
        equity: equityRow(index, '1000', '1000'),
      })),
    );
    harness.runs.updateRun(runId, { periodEnd: PERIOD_START + 4 * HOUR });
    if (kind === 'walk_forward') {
      harness.runs.seed(runId, 'windows', [
        {
          windowIndex: 0,
          trainStart: at(0),
          trainEnd: at(2),
          testStart: at(2),
          testEnd: at(5),
          bestParams: undefined,
          status: 'ok',
          inSample: {},
          outOfSample: {},
          eligibleCombinations: 1,
        },
      ]);
    }
    const chart = await chartOf(runId);
    expect(chart.decisions).toBeNull();
    harness.queries.length = 0;
    await chartOf(runId);
    expect(harness.queries).not.toContain('listDecisionMarkers');
  });
});

describe('compra que não preencheu e saídas sem sinal (L21)', () => {
  async function createRunWithFlow(): Promise<string> {
    const runId = await createLiveRun(harness, { subject: SUBJECT_A });
    const rows = Array.from({ length: 20 }, (_unused, index) => {
      const votes = index === 3 || index === 19 ? BOUGHT_VOTES : WAITING_VOTES;
      return { signal: decisionRow(index, votes), equity: equityRow(index, '1000', '1000') };
    });
    seedDecisions(harness, runId, rows);
    harness.runs.seed(runId, 'positions', [
      positionRow({ key: 'stopped', openedIndex: 10, closedIndex: 14, exitReason: 'stop' }),
    ]);
    return runId;
  }

  test('BUY sem posição na vela seguinte espera; na última vela fica pendente; a saída por stop é "exited"', async () => {
    const chart = await chartOf(await createRunWithFlow());
    const byTime = new Map((chart.decisions ?? []).map((item) => [item.candleTime, item]));
    expect(byTime.get(at(3))).toMatchObject({ action: 'BUY', outcome: 'waited' });
    expect(byTime.get(at(19))).toMatchObject({ action: 'BUY', outcome: 'buy_pending' });
    expect(byTime.get(at(14))).toMatchObject({ outcome: 'exited', scoreThreshold: '2' });
    expect(byTime.get(at(12))).toMatchObject({ outcome: 'waited', scoreThreshold: '-2' });
  });

  test('falha ao ler as decisões não derruba o gráfico: decisions é null e o resto segue', async () => {
    const runId = await createRunWithFlow();
    const failure = spyOn(harness.runs.liveStatus, 'listDecisionMarkers').mockRejectedValue(
      new Error('falha da leitura'),
    );
    try {
      const chart = await chartOf(runId);
      expect(chart.decisions).toBeNull();
      expect(chart.markers).not.toBeUndefined();
    } finally {
      failure.mockRestore();
    }
  });
});
