// Copyright (c) 2026 Ada Technology. All rights reserved.
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';

import type { Route } from '../apps/api-ativada/src/router/route.types.js';
import type { CandleRecord } from '../packages/database/src/index.js';
import { expectIndistinguishableNotFound } from './fixtures/not-found-response.fixture.js';
import type { ApiApp } from './fixtures/api-routes/api-app.fixture.js';
import {
  buildHourlyCandles,
  createRunsHarness,
  EXCHANGE,
  HOUR,
  MISSING_ID,
  NOW,
  readJson,
  SUBJECT_A,
  SUBJECT_B,
  type HarnessParts,
  type RunsHarness,
} from './fixtures/api-routes/runs-harness.fixture.js';
import {
  CLASSIC_CANDLES,
  createLiveRun,
} from './fixtures/live-status/live-status-scenario.fixture.js';

// "Pergunte à equipe" (ADR 0002 "Perguntas à equipe"): cada pergunta rápida da sala, dono, validação, limite e documentação.

const RUNS = '/v1/runs';
const ONE_MINUTE = 60_001;
const RISING = 'ETHUSDT';
const SHORT = 'SOLUSDT';
const EMPTY = 'BNBUSDT';
const NOTICE =
  'Leitura da estratégia desta simulação sobre velas já fechadas. Não é recomendação de compra ou venda.';

type Answer = {
  version: string;
  runId: string;
  symbol: string;
  question: string;
  agent: string;
  answer: string;
  basis: string;
  asOf: { candleTime: number; closedAt: number } | null;
  notice: string;
};

// 300 velas de 1 h (o aquecimento do Placar clássico é de 194) que só sobem (fechamento +10 por vela, volume constante): a média rápida fica acima da lenta, o RSI vai a 100
// e o OBV sobe acima da média dele. Votos esperados sem perguntar ao motor: tendência +1, reversão −1, volume +1.
const RISING_CANDLES: readonly CandleRecord[] = buildHourlyCandles({
  symbol: RISING,
  count: 300,
  firstOpenTime: NOW - 300 * HOUR,
}).map((candle, index) => {
  const close = 2000 + 10 * index;
  return {
    ...candle,
    open: `${close - 5}.00000000`,
    high: `${close + 2}.00000000`,
    low: `${close - 7}.00000000`,
    close: `${close}.00000000`,
    volume: '50.00000000',
  };
});
const SHORT_CANDLES = buildHourlyCandles({
  symbol: SHORT,
  count: 3,
  firstOpenTime: NOW - 3 * HOUR,
});
const LAST_RISING = RISING_CANDLES.at(-1);

function questionsRoute(app: ApiApp, parts: HarnessParts): Route {
  const live = {
    runs: parts.runs.repository,
    strategies: parts.strategies.repository,
    live: parts.runs.liveStatus,
    exchange: EXCHANGE,
  };
  const projections = app.projectionsUseCase.createProjectionsUseCase({
    ...live,
    results: parts.runs.results,
    projections: parts.runs.projections,
  });
  const tradePlan = app.tradePlanUseCase.createTradePlanUseCase({
    ...live,
    teams: parts.modelTeams.teams,
    reports: parts.modelTeams.reads,
  });
  const questions = app.questionsUseCase.createQuestionsUseCase({
    ...live,
    candles: parts.candles.repository,
    sentiments: { listAvailable: () => Promise.resolve([]) },
    now: () => parts.clock.now,
    cache: app.questionReadings.createQuestionReadingsCache(),
    tradePlan,
    projections,
  });
  return app.questionsRoute.createQuestionsRoute({
    questions,
    enabled: { symbols: ['BTCUSDT', RISING, SHORT, EMPTY] },
  });
}

let harness: RunsHarness;
let runId: string;

beforeAll(async () => {
  harness = await createRunsHarness({
    candles: [...CLASSIC_CANDLES, ...RISING_CANDLES, ...SHORT_CANDLES],
    extraRoutes: (app, parts) => [questionsRoute(app, parts)],
  });
  runId = await createLiveRun(harness, { subject: SUBJECT_A });
});

afterAll(async () => {
  await harness.stop();
});

function call(params: { subject?: string; path: string }): Promise<Response> {
  return harness.call(params);
}

// Um minuto entre as perguntas: o balde de 20 por minuto só entra no teste dele.
async function ask(symbol: string, question: string): Promise<Answer> {
  harness.clock.now += ONE_MINUTE;
  const response = await readJson(
    await call({
      subject: SUBJECT_A,
      path: `${RUNS}/${runId}/questions?symbol=${symbol}&question=${question}`,
    }),
  );
  expect(response.status).toBe(200);
  return (response.body as { data: Answer }).data;
}

describe('as perguntas rápidas', () => {
  test('Tiago: a tendência de alta pela EMA, com o que falta e a vela lida', async () => {
    const data = await ask(RISING, 'trend');
    expect(data.agent).toBe('tiago');
    expect(data.version).toBe('questions-1');
    expect(data.notice).toBe(NOTICE);
    expect(data.answer).toBe(
      'Em ETHUSDT, pela EMA 9×21, a tendência está de alta e a regra vota a favor da compra.',
    );
    expect(data.basis).toBe('exact');
    expect(data.asOf).toStrictEqual({
      candleTime: LAST_RISING?.openTime ?? 0,
      closedAt: (LAST_RISING?.openTime ?? 0) + HOUR,
    });
  });

  test('Renata: o RSI esticado para cima; Vitor: o volume confirma a alta', async () => {
    const stretch = await ask(RISING, 'stretch');
    expect(stretch.agent).toBe('renata');
    expect(stretch.answer).toContain(
      'o preço está esticado para cima, e a regra vota contra a compra',
    );
    expect(stretch.answer).toContain('o RSI precisa ficar abaixo de 30');
    expect(stretch.basis).toBe('indicative');
    const volume = await ask(RISING, 'volume');
    expect(volume.agent).toBe('vitor');
    expect(volume.answer).toContain('o volume confirma a alta, e a regra vota a favor da compra');
  });

  test('Sofia: sem leitura do Fear & Greed e sem regra de sentimento no placar', async () => {
    const data = await ask(RISING, 'sentiment');
    expect(data.agent).toBe('sofia');
    expect(data.answer).toBe('Ainda não há leitura recente do Fear & Greed.');
  });

  test('Alice: o placar e o que falta, e o plano igual ao da rota irmã', async () => {
    const gap = await ask(RISING, 'entry_gap');
    expect(gap.agent).toBe('alice');
    expect(gap.answer).toMatch(/^Em ETHUSDT, o placar está em −?\d+(,\d+)?\./);
    expect(gap.answer).toContain('Isto não é previsão');
    const plan = await ask('BTCUSDT', 'plan');
    const sibling = await readJson(
      await call({ subject: SUBJECT_A, path: `${RUNS}/${runId}/trade-plan` }),
    );
    expect(plan.answer).toBe(
      (sibling.body as { data: { plan: { message: string } } }).data.plan.message,
    );
    expect(plan.basis).toBe('indicative');
    const other = await ask(RISING, 'plan');
    expect(other.answer).toBe(
      'O plano de operação só existe para BTCUSDT, o par desta simulação. Para ETHUSDT, pergunte o que falta para comprar.',
    );
  });

  test('Otávio: o acerto da previsão é o resumo da rota de previsões; outro par recebe a frase própria', async () => {
    const data = await ask('BTCUSDT', 'track_record');
    expect(data.agent).toBe('otavio');
    const sibling = await readJson(
      await call({ subject: SUBJECT_A, path: `${RUNS}/${runId}/projections` }),
    );
    const summary = (
      sibling.body as { data: { summary: { message: string; verdictMessage: string } } }
    ).data.summary;
    expect(data.answer).toBe(`${summary.message} ${summary.verdictMessage}`);
    const other = await ask(RISING, 'track_record');
    expect(other.answer).toBe('Só conto as previsões desta simulação, que é em BTCUSDT.');
  });

  test('par sem velas: "Sem dados de <par> ainda."; poucas velas: aquecimento', async () => {
    const empty = await ask(EMPTY, 'trend');
    expect(empty.answer).toBe('Sem dados de BNBUSDT ainda.');
    expect(empty.asOf).toBeNull();
    const short = await ask(SHORT, 'trend');
    expect(short.answer).toBe(
      'Ainda não há velas fechadas suficientes de SOLUSDT para essa leitura.',
    );
  });
});

describe('dono, validação e limite', () => {
  test('execução alheia, inexistente e id malformado são o mesmo 404; sem token é 401', async () => {
    const query = '/questions?symbol=BTCUSDT&question=trend';
    const missing = (): Promise<Response> =>
      call({ subject: SUBJECT_A, path: `${RUNS}/${MISSING_ID}${query}` });
    await expectIndistinguishableNotFound({
      expectedCode: 'RUN_NOT_FOUND',
      foreignResourceResponse: await call({ subject: SUBJECT_B, path: `${RUNS}/${runId}${query}` }),
      missingResourceResponse: await missing(),
    });
    await expectIndistinguishableNotFound({
      expectedCode: 'RUN_NOT_FOUND',
      foreignResourceResponse: await call({ subject: SUBJECT_B, path: `${RUNS}/xyz${query}` }),
      missingResourceResponse: await missing(),
    });
    expect((await call({ path: `${RUNS}/${runId}${query}` })).status).toBe(401);
  });

  test('par não habilitado, pergunta fora do catálogo, campo faltando ou a mais são 400; backtest é 409', async () => {
    harness.clock.now += ONE_MINUTE;
    for (const query of [
      'symbol=DOGEUSDT&question=trend',
      'symbol=BTCUSDT&question=buy',
      'symbol=BTCUSDT',
      'symbol=BTCUSDT&question=trend&x=1',
    ]) {
      const response = await call({
        subject: SUBJECT_A,
        path: `${RUNS}/${runId}/questions?${query}`,
      });
      expect(response.status).toBe(400);
      expect(await response.text()).not.toContain('DOGEUSDT');
    }
    const backtest = await createLiveRun(harness, { subject: SUBJECT_A, kind: 'backtest' });
    const conflict = await readJson(
      await call({
        subject: SUBJECT_A,
        path: `${RUNS}/${backtest}/questions?symbol=BTCUSDT&question=trend`,
      }),
    );
    expect(conflict.status).toBe(409);
  });

  test('balde próprio de 20 por minuto por usuário: a 21ª pergunta no mesmo minuto é 429', async () => {
    const route = harness.routes.find((item) => item.path === '/v1/runs/:runId/questions');
    expect(route?.rateLimitPolicy?.name).toBe('run-question');
    expect(route?.rateLimitPolicy?.limit).toBe(20);
    harness.clock.now += ONE_MINUTE;
    const statuses: number[] = [];
    for (let index = 0; index < 21; index += 1) {
      const response = await call({
        subject: SUBJECT_A,
        path: `${RUNS}/${runId}/questions?symbol=${RISING}&question=trend`,
      });
      statuses.push(response.status);
    }
    expect(statuses.slice(0, 20).every((status) => status === 200)).toBe(true);
    expect(statuses[20]).toBe(429);
  });
});
