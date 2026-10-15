// Copyright (c) 2026 Ada Technology. All rights reserved.
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';

import { expectIndistinguishableNotFound } from './fixtures/not-found-response.fixture.js';
import {
  createRunsHarness,
  HOUR,
  MISSING_ID,
  NOW,
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
const LIVE_STATUS_PATH = '/live-status';
const DECISIONS_PATH = '/decisions';
const NOT_A_FORECAST =
  'Isto não é previsão: o preço pode nunca chegar lá, e outras regras podem mudar de voto antes.';
const INDICATIVE_NOTE = ' (aproximado: o indicador se move com a próxima vela)';

type Decision = {
  candleTime: number;
  closedAt: number;
  close: string;
  action: string;
  outcome: string;
  score: string;
  scoreThreshold: string;
  regime: string;
  message: string;
  technicalReason: string;
  votes: {
    ruleId: string;
    label: string;
    kind: string;
    vote: number;
    weight: string;
    isMissing: boolean;
    reading: Record<string, string> | null;
  }[];
};
type Trigger = { ruleId: string; label: string; isMet: boolean; message: string };
type LiveStatus = {
  run: Record<string, unknown>;
  balance: Record<string, unknown>;
  buyAndHold: Record<string, unknown> | null;
  goal: Record<string, unknown> | null;
  openPosition: Record<string, unknown> | null;
  triggers: {
    status: string;
    state?: string;
    score?: string;
    scoreThreshold?: string;
    scoreGap?: string;
    reason?: string;
    message: string;
    rules?: Trigger[];
  };
  decisions: { items: Decision[]; nextCursor: string | null };
};
type ErrorBody = { error: { code: string; details?: { field: string; reason: string }[] } };

let harness: RunsHarness;

beforeAll(async () => {
  harness = await createRunsHarness({ candles: CLASSIC_CANDLES });
});

afterAll(async () => {
  await harness.stop();
});

// Os votos do exemplo da spec: placar 1 de 2 e a regra que mais segura a compra é o RSI neutro (peso 1,5).
const WAITING_VOTES: ClassicVotes = [1, -1, 0, 1];
const DECISIONS = 30;

function flatRows(): {
  signal: ReturnType<typeof decisionRow>;
  equity: ReturnType<typeof equityRow>;
}[] {
  return Array.from({ length: DECISIONS }, (_unused, index) => ({
    signal: decisionRow(index, WAITING_VOTES),
    equity: equityRow(index, '1000', index === DECISIONS - 1 ? '1023.4' : '1000'),
  }));
}

async function liveStatusOf(runId: string, subject = SUBJECT_A): Promise<LiveStatus> {
  const { status, body } = await readJson(
    await harness.call({ subject, path: `${RUNS}/${runId}${LIVE_STATUS_PATH}` }),
  );
  expect(status).toBe(200);
  return (body as { data: LiveStatus }).data;
}

async function createWaitingRun(): Promise<string> {
  const runId = await createLiveRun(harness, { subject: SUBJECT_A });
  seedDecisions(harness, runId, flatRows());
  return runId;
}

describe('simulação ao vivo sem nenhuma compra: o exemplo da spec', () => {
  test('saldo, resultado, comprar e segurar, gatilhos e a primeira página das decisões', async () => {
    const runId = await createWaitingRun();
    const status = await liveStatusOf(runId);
    expect(status.run).toStrictEqual({
      id: runId,
      status: 'running',
      symbol: 'BTCUSDT',
      timeframe: '1h',
      periodStart: PERIOD_START,
      lastCandleTime: at(DECISIONS - 1),
      lastDecisionAt: at(DECISIONS - 1) + HOUR,
      nextDecisionAt: at(DECISIONS) + HOUR,
      waitingForData: null,
    });
    expect(status.balance).toStrictEqual({
      initial: '1000',
      current: '1000',
      result: '0',
      resultRate: '0',
      observedAt: at(DECISIONS - 1) + HOUR,
      message:
        'Seu saldo agora: 1.000,00 USDT (começou com 1.000,00 USDT). Resultado: 0,00 USDT (0,00%).',
    });
    expect(status.buyAndHold).toStrictEqual({
      value: '1023.4',
      resultRate: '0.0234',
      differencePoints: '-2.34',
      comparison: 'below',
      message:
        'A estratégia está 2,34 pontos percentuais abaixo de comprar e segurar no mesmo período.',
    });
    expect(status.goal).toBeNull();
    expect(status.openPosition).toBeNull();
  });

  test('o que falta para comprar agora, regra por regra, e o aviso de que não é previsão', async () => {
    const status = await liveStatusOf(await createWaitingRun());
    const { triggers } = status;
    expect(triggers).toMatchObject({
      status: 'available',
      state: 'awaiting_entry',
      score: '1',
      scoreThreshold: '2',
      scoreGap: '1',
      message: `Faltam 1 ponto de 2 para comprar. ${NOT_A_FORECAST}`,
    });
    expect(
      triggers.rules?.map((rule) => [rule.ruleId, rule.label, rule.isMet, rule.message]),
    ).toStrictEqual([
      ['ema-9-21', 'EMA 9×21', true, 'EMA 9×21: já vota para comprar.'],
      [
        'macd-12-26-9',
        'MACD 12/26/9',
        false,
        `MACD 12/26/9: o MACD precisa passar a linha de sinal${INDICATIVE_NOTE}.`,
      ],
      ['rsi-14', 'RSI 14', false, `RSI 14: o RSI precisa ficar abaixo de 30${INDICATIVE_NOTE}.`],
      ['obv-ema-20', 'OBV×EMA 20', true, 'OBV×EMA 20: já vota para comprar.'],
    ]);
  });

  test('cada vela vira uma linha, esperas incluídas: hora de fechamento, preço, frase e voto de cada regra', async () => {
    const status = await liveStatusOf(await createWaitingRun());
    const { items, nextCursor } = status.decisions;
    expect(items).toHaveLength(24);
    expect(nextCursor).not.toBeNull();
    expect(items.map((item) => item.candleTime)).toStrictEqual(
      Array.from({ length: 24 }, (_unused, offset) => at(DECISIONS - 1 - offset)),
    );
    expect(items[0]).toStrictEqual({
      candleTime: at(DECISIONS - 1),
      closedAt: at(DECISIONS - 1) + HOUR,
      close: '30050.5',
      action: 'HOLD',
      outcome: 'waited',
      score: '1',
      scoreThreshold: '2',
      regime: 'ranging',
      message: 'Faltou 1 ponto: o RSI (55) está entre 30 e 70.',
      technicalReason: `Técnico ${DECISIONS - 1} · pontuação 1`,
      votes: [
        {
          ruleId: 'ema-9-21',
          label: 'EMA 9×21',
          kind: 'ema_cross',
          vote: 1,
          weight: '0.5',
          isMissing: false,
          reading: { fast: '12', slow: '11' },
        },
        {
          ruleId: 'macd-12-26-9',
          label: 'MACD 12/26/9',
          kind: 'macd',
          vote: -1,
          weight: '0.5',
          isMissing: false,
          reading: { macd: '-0.5', signal: '-0.2' },
        },
        {
          ruleId: 'rsi-14',
          label: 'RSI 14',
          kind: 'rsi',
          vote: 0,
          weight: '1.5',
          isMissing: false,
          reading: { value: '55' },
        },
        {
          ruleId: 'obv-ema-20',
          label: 'OBV×EMA 20',
          kind: 'obv_trend',
          vote: 1,
          weight: '1',
          isMissing: false,
          reading: { obv: '110', ema: '100' },
        },
      ],
    });
  });

  test('as páginas seguintes (cursor) completam a lista sem repetir nem perder uma decisão', async () => {
    const runId = await createWaitingRun();
    const first = (await liveStatusOf(runId)).decisions;
    const secondResponse = await readJson(
      await harness.call({
        subject: SUBJECT_A,
        path: `${RUNS}/${runId}${DECISIONS_PATH}?cursor=${first.nextCursor ?? ''}`,
      }),
    );
    const second = secondResponse.body as {
      data: Decision[];
      pagination: { nextCursor: string | null; perPage: number };
    };
    expect(secondResponse.status).toBe(200);
    expect(second.pagination).toStrictEqual({ nextCursor: null, perPage: 24 });
    const all = [...first.items, ...second.data].map((item) => item.candleTime);
    expect(all).toStrictEqual(
      Array.from({ length: DECISIONS }, (_unused, offset) => at(DECISIONS - 1 - offset)),
    );
  });

  test('a rota das decisões sem cursor devolve as mesmas 24 linhas da primeira página do live-status', async () => {
    const runId = await createWaitingRun();
    const status = await liveStatusOf(runId);
    const { body } = await readJson(
      await harness.call({ subject: SUBJECT_A, path: `${RUNS}/${runId}${DECISIONS_PATH}` }),
    );
    const page = body as {
      data: Decision[];
      pagination: { nextCursor: string | null; perPage: number };
    };
    expect(page.data).toStrictEqual(status.decisions.items);
    expect(page.pagination).toStrictEqual({ nextCursor: status.decisions.nextCursor, perPage: 24 });
  });

  test('limit de 1 a 100: respeita o pedido, e o teto de 100 passa', async () => {
    const runId = await createWaitingRun();
    for (const [limit, expected] of [
      [1, 1],
      [7, 7],
      [100, DECISIONS],
    ] as const) {
      const { status, body } = await readJson(
        await harness.call({
          subject: SUBJECT_A,
          path: `${RUNS}/${runId}${DECISIONS_PATH}?limit=${limit}`,
        }),
      );
      expect(status).toBe(200);
      expect((body as { data: unknown[] }).data).toHaveLength(expected);
    }
  });

  test('nenhuma frase do servidor leva data nem hora (o painel monta o horário no fuso do usuário)', async () => {
    const status = await liveStatusOf(await createWaitingRun());
    const texts = [
      status.balance['message'],
      status.buyAndHold?.['message'],
      status.triggers.message,
      ...(status.triggers.rules ?? []).map((rule) => rule.message),
      ...status.decisions.items.map((item) => item.message),
    ].map(String);
    for (const text of texts) {
      expect(text).not.toMatch(/\d{1,2}:\d{2}/);
      expect(text).not.toMatch(/(?<![\d/])\d{1,2}\/\d{1,2}(?![\d/])/);
    }
  });
});

describe('sem vela, aquecendo, comprada, parada e concluída', () => {
  test('leitura gravada que não é número (texto no lugar do RSI) vira ausência nas decisões: a frase sai sem o valor e a leitura é nula', async () => {
    const runId = await createLiveRun(harness, { subject: SUBJECT_A });
    const dirty = decisionRow(0, WAITING_VOTES);
    seedDecisions(harness, runId, [
      {
        signal: { ...dirty, indicators: { ...dirty.indicators, 'rule:rsi-14': 'abc' } },
        equity: equityRow(0, '1000', '1000'),
      },
    ]);
    const { body } = await readJson(
      await harness.call({ subject: SUBJECT_A, path: `${RUNS}/${runId}${DECISIONS_PATH}` }),
    );
    const [item] = (body as { data: Decision[] }).data;
    expect(item?.message).toBe('Faltou 1 ponto: o RSI está entre 30 e 70.');
    expect(item?.votes.find((vote) => vote.ruleId === 'rsi-14')?.reading).toBeNull();
  });

  test('sem nenhuma vela fechada: saldo inicial, sem comparação, sem decisões e a razão dos gatilhos', async () => {
    const runId = await createLiveRun(harness, { subject: SUBJECT_A });
    const status = await liveStatusOf(runId);
    expect(status.run).toMatchObject({
      lastCandleTime: null,
      lastDecisionAt: null,
      nextDecisionAt: Math.floor((PERIOD_START + 1_800_000) / HOUR) * HOUR + HOUR,
    });
    expect(status.balance).toStrictEqual({
      initial: '1000',
      current: '1000',
      result: '0',
      resultRate: '0',
      observedAt: null,
      message: 'Ainda sem vela fechada; o saldo é o inicial: 1.000,00 USDT.',
    });
    expect(status.buyAndHold).toBeNull();
    expect(status.triggers).toStrictEqual({
      status: 'unavailable',
      reason: 'no_candle',
      message: 'Aguardando a primeira vela fechar.',
    });
    expect(status.decisions).toStrictEqual({ items: [], nextCursor: null });
  });

  test('aquecendo: com Donchian, a primeira decisão ainda não tem a vela anterior e os gatilhos dizem isso', async () => {
    const created = await harness.strategies.repository.createStrategyWithFirstVersion(
      harness.scopeOf(SUBJECT_A),
      {
        name: 'Rompimento',
        isExample: false,
        config: {
          schemaVersion: 1,
          rules: [{ id: 'donchian-20', kind: 'donchian_breakout', period: 20 }],
          thresholds: { buy: '1', sell: '-1' },
          risk: {
            atrPeriod: 14,
            stopAtrMultiple: '2',
            targetAtrMultiple: '3',
            riskPerTrade: '0.01',
            maxExposureRate: '1',
          },
        },
        configHash: 'd'.repeat(64),
      },
    );
    const runId = await createLiveRun(harness, {
      subject: SUBJECT_A,
      versionId: created.version.id,
    });
    const row = decisionRow(0, [0, 0, 0, 0]);
    seedDecisions(harness, runId, [
      {
        signal: {
          ...row,
          score: '0',
          votes: [
            { ruleId: 'donchian-20', family: 'trend', vote: 0, weight: '1', isMissing: false },
          ],
          indicators: {
            'rule:donchian-20.lower': 29_000,
            'rule:donchian-20.upper': 31_000,
            'risk:atr': 1.5,
          },
        },
        equity: equityRow(0, '1000', '1000'),
      },
    ]);
    const status = await liveStatusOf(runId);
    expect(status.triggers).toStrictEqual({
      status: 'unavailable',
      reason: 'warming_up',
      message:
        'O gatilho do rompimento precisa de duas velas decididas; aparece no próximo fechamento.',
    });
    expect(status.decisions.items).toHaveLength(1);
    expect(status.decisions.items[0]?.message).toBe(
      'Faltou 1 ponto: o preço não fechou acima da máxima das últimas 20 velas.',
    );
  });

  test('comprada: posição aberta com alvo e stop, gatilhos de venda e a frase de cada decisão', async () => {
    const runId = await createLiveRun(harness, { subject: SUBJECT_A });
    const boughtVotes: ClassicVotes = [1, 1, 1, 0];
    const soldVotes: ClassicVotes = [-1, -1, -1, 0];
    const rows = Array.from({ length: DECISIONS }, (_unused, index) => {
      const votes =
        index === 4 || index === 20 ? boughtVotes : index === 7 ? soldVotes : WAITING_VOTES;
      return { signal: decisionRow(index, votes), equity: equityRow(index, '1000', '1000') };
    });
    seedDecisions(harness, runId, rows);
    harness.runs.seed(runId, 'positions', [
      positionRow({ key: 'p1', openedIndex: 5, closedIndex: 8 }),
      positionRow({ key: 'p2', openedIndex: 21, closedIndex: undefined }),
    ]);
    const status = await liveStatusOf(runId);
    expect(status.openPosition).toStrictEqual({
      entryPrice: '30000.5',
      quantity: '0.033',
      targetPrice: '31500',
      stopPrice: '29000',
      openedCandleTime: at(21),
    });
    expect(status.triggers).toMatchObject({
      status: 'available',
      state: 'holding',
      score: '1',
      scoreThreshold: '-2',
      scoreGap: '3',
      message: `Faltam 3 pontos de −2 para vender. ${NOT_A_FORECAST}`,
    });
    const rsi = status.triggers.rules?.find((rule) => rule.ruleId === 'rsi-14');
    expect(rsi?.message).toBe(`RSI 14: o RSI precisa ficar acima de 70${INDICATIVE_NOTE}.`);
    const decision = (index: number): Decision => {
      const found = [...status.decisions.items].find((item) => item.candleTime === at(index));
      if (found === undefined) throw new Error(`decisão ${index} fora da página`);
      return found;
    };
    expect(decision(20)).toMatchObject({
      action: 'BUY',
      outcome: 'bought',
      scoreThreshold: '2',
      message: 'Comprou: 3 de 4 regras a favor (EMA 9×21, MACD 12/26/9 e RSI 14).',
    });
    expect(decision(25)).toMatchObject({
      action: 'HOLD',
      outcome: 'waited',
      scoreThreshold: '-2',
      message: 'Esperou: já está comprada; a venda pede pontuação −2 e está em 1.',
    });
    expect(decision(7)).toMatchObject({
      action: 'SELL',
      outcome: 'sold',
      scoreThreshold: '-2',
      message: 'Vendeu: 3 de 4 regras contra (EMA 9×21, MACD 12/26/9 e RSI 14).',
    });
    expect(decision(9)).toMatchObject({
      outcome: 'waited',
      scoreThreshold: '2',
      message: 'Faltou 1 ponto: o RSI (55) está entre 30 e 70.',
    });
  });

  test('a carteira nas bordas: aberta na própria vela conta, fechada nela não, compra e venda na mesma vela não', async () => {
    const runId = await createLiveRun(harness, { subject: SUBJECT_A });
    seedDecisions(harness, runId, flatRows());
    harness.runs.seed(runId, 'positions', [
      positionRow({ key: 'across', openedIndex: 5, closedIndex: 8 }),
      positionRow({ key: 'same-candle', openedIndex: 12, closedIndex: 12 }),
    ]);
    const { body } = await readJson(
      await harness.call({
        subject: SUBJECT_A,
        path: `${RUNS}/${runId}${DECISIONS_PATH}?limit=${DECISIONS}`,
      }),
    );
    const thresholds = new Map(
      (body as { data: Decision[] }).data.map((item) => [item.candleTime, item.scoreThreshold]),
    );
    expect([4, 5, 7, 8, 12, 13].map((index) => [index, thresholds.get(at(index))])).toStrictEqual([
      [4, '2'],
      [5, '-2'],
      [7, '-2'],
      [8, '2'],
      [12, '2'],
      [13, '2'],
    ]);
  });

  test('compra sem preenchimento e saída por alvo, stop, lacuna e comando têm a frase própria (L21)', async () => {
    const runId = await createLiveRun(harness, { subject: SUBJECT_A });
    const buyRow = (index: number): ReturnType<typeof flatRows>[number] => ({
      signal: decisionRow(index, [1, 1, 1, 0]),
      equity: equityRow(index, '1000', '1000'),
    });
    const rows = flatRows().map((row, index) =>
      index === 3 || index === 20 || index === DECISIONS - 1 ? buyRow(index) : row,
    );
    seedDecisions(harness, runId, rows);
    harness.runs.seed(runId, 'positions', [
      positionRow({ key: 'target', openedIndex: 5, closedIndex: 7, exitReason: 'target' }),
      positionRow({ key: 'stop', openedIndex: 9, closedIndex: 10, exitReason: 'stop' }),
      positionRow({ key: 'gap', openedIndex: 12, closedIndex: 13, exitReason: 'gap' }),
      positionRow({ key: 'command', openedIndex: 15, closedIndex: 16, exitReason: 'command' }),
      positionRow({ key: 'filled', openedIndex: 21, closedIndex: 22 }),
    ]);
    const { body } = await readJson(
      await harness.call({
        subject: SUBJECT_A,
        path: `${RUNS}/${runId}${DECISIONS_PATH}?limit=${DECISIONS}`,
      }),
    );
    const byTime = new Map(
      (body as { data: Decision[] }).data.map((item) => [item.candleTime, item]),
    );
    const read = (index: number): [string | undefined, string | undefined] => [
      byTime.get(at(index))?.outcome,
      byTime.get(at(index))?.message,
    ];
    expect(read(3)).toStrictEqual(['waited', 'Sinal de compra sem execução.']);
    expect(read(7)).toStrictEqual(['exited', 'Vendeu no alvo (31.500,00).']);
    expect(read(10)).toStrictEqual(['exited', 'Vendeu no stop (29.000,00).']);
    expect(read(13)).toStrictEqual(['exited', 'Saiu pela lacuna de dados.']);
    expect(read(16)).toStrictEqual(['exited', 'Saiu porque a meta terminou.']);
    expect(read(20)[0]).toBe('bought');
    expect(read(22)[0]).toBe('waited');
    const firstPage = await readJson(
      await harness.call({ subject: SUBJECT_A, path: `${RUNS}/${runId}${DECISIONS_PATH}?limit=9` }),
    );
    const cursor = (firstPage.body as { pagination: { nextCursor: string } }).pagination.nextCursor;
    const secondPage = await readJson(
      await harness.call({
        subject: SUBJECT_A,
        path: `${RUNS}/${runId}${DECISIONS_PATH}?limit=5&cursor=${cursor}`,
      }),
    );
    const olderPage = (secondPage.body as { data: Decision[] }).data;
    expect(olderPage[0]).toMatchObject({ candleTime: at(20), outcome: 'bought' });
    expect(read(DECISIONS - 1)).toStrictEqual([
      'buy_pending',
      'Pediu compra: executa na abertura da próxima vela.',
    ]);
  });

  test('parada ou concluída: o saldo continua e os gatilhos dizem por que não há', async () => {
    for (const [status, text] of [
      ['completed', 'foi concluída'],
      ['cancelled', 'foi parada'],
      ['failed', 'terminou com falha'],
      ['queued', 'está na fila'],
    ] as const) {
      const runId = await createLiveRun(harness, { subject: SUBJECT_A, status });
      seedDecisions(harness, runId, flatRows());
      const live = await liveStatusOf(runId);
      expect(live.triggers).toStrictEqual({
        status: 'unavailable',
        reason: 'not_running',
        message: `Sem gatilhos agora: a simulação ${text}.`,
      });
      expect(live.run['nextDecisionAt']).toBeNull();
      expect(live.balance['current']).toBe('1000');
      expect(live.decisions.items).toHaveLength(24);
    }
  });
});

describe('meta da simulação', () => {
  const GOAL = { targetRate: '0.03', maxLossRate: '0.05', horizonDays: 7 };

  test('com meta: alvo, prazo (início + 7 dias), o que falta e o que ainda cabe de queda', async () => {
    const runId = await createLiveRun(harness, { subject: SUBJECT_A, goal: GOAL });
    seedDecisions(
      harness,
      runId,
      Array.from({ length: DECISIONS }, (_unused, index) => ({
        signal: decisionRow(index, WAITING_VOTES),
        equity: equityRow(index, '1012.5', '1000'),
      })),
    );
    const deadlineAt = PERIOD_START + 7 * 24 * HOUR;
    const status = await liveStatusOf(runId);
    expect(status.goal).toStrictEqual({
      targetRate: '0.03',
      targetAmount: '1030',
      remainingAmount: '17.5',
      remainingRate: '0.0175',
      deadlineAt,
      remainingMilliseconds: deadlineAt - NOW,
      maxLossRate: '0.05',
      floorAmount: '950',
      lossRoomAmount: '62.5',
      outcome: null,
      outcomeAt: null,
      message:
        'Meta: +3% em 7 dias → chegar a 1.030,00 USDT. Faltam 17,50 USDT (1,75%). Perda máxima aceita: −5% (950,00 USDT); ainda cabem 62,50 USDT de queda.',
    });
    expect(status.buyAndHold).toMatchObject({ comparison: 'above' });
  });

  test('com desfecho gravado o bloco traz o desfecho e a frase dele', async () => {
    const runId = await createLiveRun(harness, {
      subject: SUBJECT_A,
      goal: GOAL,
      status: 'completed',
    });
    seedDecisions(harness, runId, flatRows());
    harness.runs.updateRun(runId, { goalOutcome: 'goal_reached', goalOutcomeCandleTime: at(20) });
    const status = await liveStatusOf(runId);
    expect(status.goal).toMatchObject({
      outcome: 'goal_reached',
      outcomeAt: at(20) + HOUR,
      message: 'Meta alcançada.',
    });
  });

  test('sem meta o bloco é nulo', async () => {
    const status = await liveStatusOf(await createWaitingRun());
    expect(status.goal).toBeNull();
  });
});

describe('contrato do esquema documentado e das consultas', () => {
  test('as duas respostas batem com o esquema Zod da documentação e as rotas exigem usuário', async () => {
    const runId = await createWaitingRun();
    const liveRoute = harness.routes.find((route) => route.path === `${RUNS}/:runId/live-status`);
    const decisionsRoute = harness.routes.find(
      (route) => route.path === `${RUNS}/:runId/decisions`,
    );
    expect([liveRoute?.access, decisionsRoute?.access]).toStrictEqual(['user', 'user']);
    expect(liveRoute?.documentation).toBeDefined();
    expect(decisionsRoute?.documentation).toBeDefined();
    const live = await readJson(
      await harness.call({ subject: SUBJECT_A, path: `${RUNS}/${runId}${LIVE_STATUS_PATH}` }),
    );
    const liveSchema = liveRoute?.documentation?.successes[0]?.schema;
    const liveParsed = liveSchema?.safeParse((live.body as { data: unknown }).data);
    expect(liveParsed?.success).toBe(true);
    const list = await readJson(
      await harness.call({ subject: SUBJECT_A, path: `${RUNS}/${runId}${DECISIONS_PATH}` }),
    );
    const listParsed = decisionsRoute?.documentation?.successes[0]?.schema?.safeParse(
      (list.body as { data: unknown }).data,
    );
    expect(listParsed?.success).toBe(true);
  });

  test('o live-status faz no máximo 5 consultas e as decisões 4, todas por chave', async () => {
    const runId = await createWaitingRun();
    harness.queries.length = 0;
    await liveStatusOf(runId);
    expect(harness.queries).toHaveLength(5);
    expect(new Set(harness.queries)).toStrictEqual(
      new Set([
        'findRun',
        'findVersion',
        'readLatestEquityPoint',
        'listDecisionRows',
        'listPositionsAround',
      ]),
    );
    harness.queries.length = 0;
    await harness.call({ subject: SUBJECT_A, path: `${RUNS}/${runId}${DECISIONS_PATH}` });
    expect(harness.queries).toHaveLength(4);
    expect(harness.queries).not.toContain('readLatestEquityPoint');
  });
});

describe('acesso e validação', () => {
  test('exige token nas duas rotas', async () => {
    const runId = await createWaitingRun();
    expect((await harness.call({ path: `${RUNS}/${runId}${LIVE_STATUS_PATH}` })).status).toBe(401);
    expect((await harness.call({ path: `${RUNS}/${runId}${DECISIONS_PATH}` })).status).toBe(401);
  });

  test('execução de outro usuário, inexistente, malformada e apagada dão o mesmo 404 nas duas rotas', async () => {
    const runId = await createWaitingRun();
    for (const suffix of [LIVE_STATUS_PATH, DECISIONS_PATH]) {
      const missing = await harness.call({
        subject: SUBJECT_B,
        path: `${RUNS}/${MISSING_ID}${suffix}`,
      });
      await expectIndistinguishableNotFound({
        expectedCode: 'RUN_NOT_FOUND',
        foreignResourceResponse: await harness.call({
          subject: SUBJECT_B,
          path: `${RUNS}/${runId}${suffix}`,
        }),
        missingResourceResponse: missing,
      });
      await expectIndistinguishableNotFound({
        expectedCode: 'RUN_NOT_FOUND',
        foreignResourceResponse: await harness.call({
          subject: SUBJECT_B,
          path: `${RUNS}/xyz${suffix}`,
        }),
        missingResourceResponse: missing,
      });
      const deleted = await createLiveRun(harness, { subject: SUBJECT_B, status: 'cancelled' });
      await harness.call({ subject: SUBJECT_B, method: 'DELETE', path: `${RUNS}/${deleted}` });
      await expectIndistinguishableNotFound({
        expectedCode: 'RUN_NOT_FOUND',
        foreignResourceResponse: await harness.call({
          subject: SUBJECT_B,
          path: `${RUNS}/${deleted}${suffix}`,
        }),
        missingResourceResponse: missing,
      });
    }
  });

  test('dono certo com backtest ou walk-forward: 409 RUN_NOT_LIVE nas duas rotas', async () => {
    for (const kind of ['backtest', 'walk_forward'] as const) {
      const runId = await createLiveRun(harness, { subject: SUBJECT_A, kind, status: 'completed' });
      for (const suffix of [LIVE_STATUS_PATH, DECISIONS_PATH]) {
        const response = await harness.call({
          subject: SUBJECT_A,
          path: `${RUNS}/${runId}${suffix}`,
        });
        expect(response.status).toBe(409);
        expect(((await response.json()) as ErrorBody).error.code).toBe('RUN_NOT_LIVE');
      }
    }
  });

  test('qualquer parâmetro no live-status é 400', async () => {
    const runId = await createWaitingRun();
    for (const query of ['?limit=1', '?cursor=x', '?userId=x']) {
      const response = await harness.call({
        subject: SUBJECT_A,
        path: `${RUNS}/${runId}${LIVE_STATUS_PATH}${query}`,
      });
      expect({ query, status: response.status }).toStrictEqual({ query, status: 400 });
    }
  });

  test.each([
    ['limit=0'],
    ['limit=101'],
    ['limit=abc'],
    ['limit=1.5'],
    ['cursor=%%%'],
    ['cursor=bm90LXVtLWN1cnNvcg'],
    ['order=asc'],
  ])('decisões com ?%s é 400', async (query) => {
    const runId = await createWaitingRun();
    const response = await harness.call({
      subject: SUBJECT_A,
      path: `${RUNS}/${runId}${DECISIONS_PATH}?${query}`,
    });
    expect(response.status).toBe(400);
  });

  test('decisões: todos os erros de uma vez e nenhum eco de valor', async () => {
    const runId = await createWaitingRun();
    const response = await harness.call({
      subject: SUBJECT_A,
      path: `${RUNS}/${runId}${DECISIONS_PATH}?limit=zzsecreto&cursor=!!qqsecreto&userId=x`,
    });
    const text = await response.text();
    expect(response.status).toBe(400);
    const fields = new Set((JSON.parse(text) as ErrorBody).error.details?.map((d) => d.field));
    expect(fields.has('limit')).toBe(true);
    expect(text).not.toContain('zzsecreto');
    expect(text).not.toContain('qqsecreto');
  });

  test('cursor com formato certo mas de outro tipo é 400, nunca um filtro', async () => {
    const runId = await createWaitingRun();
    const bad = btoa(JSON.stringify({ c: 1, k: 'x' })).replaceAll('=', '');
    const response = await harness.call({
      subject: SUBJECT_A,
      path: `${RUNS}/${runId}${DECISIONS_PATH}?cursor=${bad}`,
    });
    expect(response.status).toBe(400);
  });
});

describe('limite de requisições', () => {
  test('60 por minuto por usuário, o mesmo balde para o live-status e as decisões; o 61º é 429', async () => {
    const limited = await createRunsHarness({ candles: CLASSIC_CANDLES });
    try {
      const policy = limited.app.policies.RATE_LIMIT_POLICY.RUN_LIVE_STATUS;
      expect(policy.limit).toBe(60);
      const runId = await createLiveRun(limited, { subject: SUBJECT_A });
      for (let attempt = 0; attempt < policy.limit; attempt += 1) {
        const suffix = attempt % 2 === 0 ? LIVE_STATUS_PATH : DECISIONS_PATH;
        const response = await limited.call({
          subject: SUBJECT_A,
          path: `${RUNS}/${runId}${suffix}`,
        });
        expect(response.status).toBe(200);
        await response.text();
      }
      const blocked = await limited.call({
        subject: SUBJECT_A,
        path: `${RUNS}/${runId}${LIVE_STATUS_PATH}`,
      });
      expect(blocked.status).toBe(429);
      expect(Number(blocked.headers.get('Retry-After'))).toBeGreaterThanOrEqual(1);
      await blocked.text();
      const other = await limited.call({
        subject: SUBJECT_B,
        path: `${RUNS}/${MISSING_ID}${LIVE_STATUS_PATH}`,
      });
      expect(other.status).not.toBe(429);
      await other.text();
    } finally {
      await limited.stop();
    }
  });
});
