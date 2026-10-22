// Copyright (c) 2026 Ada Technology. All rights reserved.
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';

import {
  analystAt,
  ANALYST_CANDLE,
  ANALYST_SYMBOL,
  createAnalystRun,
} from './fixtures/analyst-routes/analyst-routes-scenario.fixture.js';
import {
  buildModelTeamRoutes,
  QUESTIONS_PER_DAY,
} from './fixtures/api-routes/model-team-routes.fixture.js';
import {
  EMPTY_OVERVIEW,
  readyHeartbeat,
} from './fixtures/api-routes/in-memory-model-teams.fixture.js';
import {
  createRunsHarness,
  EXCHANGE,
  MISSING_ID,
  readJson,
  SUBJECT_A,
  SUBJECT_B,
  type RunsHarness,
} from './fixtures/api-routes/runs-harness.fixture.js';
import { expectIndistinguishableNotFound } from './fixtures/not-found-response.fixture.js';

// A pergunta livre a uma equipe de modelo (adendo da spec 015): a API grava a pergunta do dono e lista as dele.

const RUNS = '/v1/runs';
const LATEST = { openTime: analystAt(3) as number | undefined };
const QUESTION = 'Como você vê o BTC nas próximas horas?';

type ErrorBody = { error: { code: string; details?: { field: string; reason: string }[] } };
type DataBody<TData> = { data: TData };
type QuestionsBody = DataBody<{
  notice: string;
  items: { id: string; status: string; question: string; answer: string | null }[];
}>;

let harness: RunsHarness;

beforeAll(async () => {
  harness = await createRunsHarness({
    candles: ['100', '101'].map((close, index) => ({
      exchange: EXCHANGE,
      symbol: ANALYST_SYMBOL,
      timeframe: '15m' as const,
      openTime: analystAt(index),
      closeTime: analystAt(index) + ANALYST_CANDLE - 1,
      open: close,
      high: close,
      low: close,
      close,
      volume: '1',
      tradeCount: 1,
    })),
    extraRoutes: (app, parts) => buildModelTeamRoutes(app, parts, { latest: LATEST }),
  });
});

afterAll(async () => {
  await harness.stop();
});

beforeEach(() => {
  harness.modelTeams.state.heartbeat = undefined;
  harness.modelTeams.state.overview = EMPTY_OVERVIEW;
  harness.modelTeams.storedQuestions.length = 0;
  harness.clock.now = Date.UTC(2026, 9, 1);
});

const askPath = (runId: string, teamKey = 'olivia'): string =>
  `${RUNS}/${runId}/model-teams/${teamKey}/questions`;
const listPath = (runId: string): string => `${RUNS}/${runId}/model-teams/questions`;

// A política é de 5 por 10 min: cada pedido cai numa janela nova (o limitador usa o relógio do harness).
async function ask(
  subject: string,
  path: string,
  body: unknown = { symbol: ANALYST_SYMBOL, question: QUESTION },
): Promise<{ status: number; body: unknown }> {
  harness.clock.now += 11 * 60_000;
  return readJson(await harness.call({ subject, method: 'POST', path, body }));
}

async function list(subject: string, path: string): Promise<{ status: number; body: unknown }> {
  return readJson(await harness.call({ subject, path }));
}

function codeOf(result: { body: unknown }): string {
  return (result.body as ErrorBody).error.code;
}

async function ready(subject = SUBJECT_A, teamKey = 'olivia'): Promise<string> {
  harness.modelTeams.enable(harness.scopeOf(subject), teamKey);
  harness.modelTeams.state.heartbeat = readyHeartbeat([teamKey]);
  return createAnalystRun(harness, { subject, hasAnalyst: false });
}

function issuesOf(method: string, suffix: string, data: unknown): readonly unknown[] {
  const route = harness.routes.find((item) => item.method === method && item.path.endsWith(suffix));
  const parsed = route?.documentation?.successes[0]?.schema?.safeParse(data);
  return parsed === undefined ? ['rota sem esquema'] : (parsed.error?.issues ?? []);
}

describe('POST /v1/runs/:runId/model-teams/:teamKey/questions', () => {
  test('exige token; execução alheia e inexistente são o mesmo 404 e nada é gravado', async () => {
    const runId = await ready();
    expect((await harness.call({ method: 'POST', path: askPath(runId) })).status).toBe(401);
    const body = { symbol: ANALYST_SYMBOL, question: QUESTION };
    await expectIndistinguishableNotFound({
      foreignResourceResponse: await harness.call({
        subject: SUBJECT_B,
        method: 'POST',
        path: askPath(runId),
        body,
      }),
      missingResourceResponse: await harness.call({
        subject: SUBJECT_B,
        method: 'POST',
        path: askPath(MISSING_ID),
        body,
      }),
      expectedCode: 'RUN_NOT_FOUND',
    });
    expect(harness.modelTeams.storedQuestions).toHaveLength(0);
  });

  test('o caminho feliz grava a pergunta aparada, pendente, e responde 202 com o id', async () => {
    const runId = await ready();
    const result = await ask(SUBJECT_A, askPath(runId), {
      symbol: ANALYST_SYMBOL,
      question: `   ${QUESTION}  `,
    });
    expect(result.status).toBe(202);
    const data = (result.body as DataBody<{ questionId: string }>).data;
    expect(issuesOf('POST', '/:teamKey/questions', data)).toStrictEqual([]);
    const [stored] = harness.modelTeams.storedQuestions;
    expect(stored?.id).toBe(data.questionId);
    expect(stored?.question).toBe(QUESTION);
    expect(stored?.teamKey).toBe('olivia');
    expect(stored?.status).toBe('pending');
    expect(stored?.userId).toBe(harness.scopeOf(SUBJECT_A).ownerUserId);
  });

  test('as recusas: chave 404, não ao vivo 409, desligada 409, provedor fora 409', async () => {
    const runId = await ready();
    expect(codeOf(await ask(SUBJECT_A, askPath(runId, 'zeca')))).toBe('MODEL_TEAM_NOT_FOUND');
    const backtest = await createAnalystRun(harness, {
      subject: SUBJECT_A,
      kind: 'backtest',
      hasAnalyst: false,
    });
    expect(codeOf(await ask(SUBJECT_A, askPath(backtest)))).toBe('RUN_NOT_LIVE');
    expect(codeOf(await ask(SUBJECT_A, askPath(runId, 'lucas')))).toBe('MODEL_TEAM_DISABLED');
    harness.modelTeams.state.heartbeat = undefined;
    expect(codeOf(await ask(SUBJECT_A, askPath(runId)))).toBe('MODEL_TEAM_UNAVAILABLE');
    expect(harness.modelTeams.storedQuestions).toHaveLength(0);
  });

  test('a validação devolve todos os erros de uma vez, sem eco do que veio', async () => {
    const runId = await ready();
    const result = await ask(SUBJECT_A, askPath(runId), {
      symbol: 'SEGREDOUSDT',
      question: 'ab',
      extra: 'ValorQueNaoPodeVazar',
    });
    expect(result.status).toBe(400);
    const fields = ((result.body as ErrorBody).error.details ?? []).map((item) => item.field);
    expect(fields).toContain('symbol');
    expect(fields).toContain('question');
    const text = JSON.stringify(result.body);
    for (const echoed of ['SEGREDOUSDT', 'ValorQueNaoPodeVazar'])
      expect(text).not.toContain(echoed);
    const tooLong = await ask(SUBJECT_A, askPath(runId), {
      symbol: ANALYST_SYMBOL,
      question: 'x'.repeat(281),
    });
    expect(tooLong.status).toBe(400);
    expect(harness.modelTeams.storedQuestions).toHaveLength(0);
  });

  test('o teto diário do usuário vale para todas as equipes e simulações: 429 depois dele', async () => {
    const runId = await ready();
    harness.modelTeams.enable(harness.scopeOf(SUBJECT_A), 'nina');
    harness.modelTeams.state.heartbeat = readyHeartbeat(['olivia', 'nina']);
    for (let index = 0; index < QUESTIONS_PER_DAY; index += 1) {
      const teamKey = index % 2 === 0 ? 'olivia' : 'nina';
      expect((await ask(SUBJECT_A, askPath(runId, teamKey))).status).toBe(202);
    }
    const over = await ask(SUBJECT_A, askPath(runId));
    expect(over.status).toBe(429);
    expect(codeOf(over)).toBe('MODEL_QUESTION_LIMIT_REACHED');
    expect(harness.modelTeams.storedQuestions).toHaveLength(QUESTIONS_PER_DAY);
  });
});

describe('GET /v1/runs/:runId/model-teams/questions', () => {
  test('lista só as perguntas do dono naquela simulação, da mais nova, no formato documentado', async () => {
    const runId = await ready();
    const other = await createAnalystRun(harness, { subject: SUBJECT_A, hasAnalyst: false });
    await ask(SUBJECT_A, askPath(runId));
    await ask(SUBJECT_A, askPath(other));
    const first = harness.modelTeams.storedQuestions[0];
    if (first === undefined) throw new Error('a pergunta não foi gravada');
    harness.modelTeams.storedQuestions[0] = {
      ...first,
      status: 'answered',
      answer: 'O BTC fechou as últimas velas perto da média. Não é recomendação.',
      costUsd: '0.00123',
      decidedAt: first.requestedAt + 5_000,
    };
    const result = await list(SUBJECT_A, listPath(runId));
    expect(result.status).toBe(200);
    const data = (result.body as QuestionsBody).data;
    expect(issuesOf('GET', '/model-teams/questions', data)).toStrictEqual([]);
    expect(data.items.map((item) => item.status)).toStrictEqual(['answered']);
    expect(data.items[0]?.question).toBe(QUESTION);
    expect(data.notice).toContain('Não é recomendação');
  });

  test('simulação alheia e inexistente são o mesmo 404; outro tipo é 409; limit fora da faixa é 400', async () => {
    const runId = await ready();
    await ask(SUBJECT_A, askPath(runId));
    await expectIndistinguishableNotFound({
      foreignResourceResponse: await harness.call({ subject: SUBJECT_B, path: listPath(runId) }),
      missingResourceResponse: await harness.call({
        subject: SUBJECT_B,
        path: listPath(MISSING_ID),
      }),
      expectedCode: 'RUN_NOT_FOUND',
    });
    const backtest = await createAnalystRun(harness, {
      subject: SUBJECT_A,
      kind: 'backtest',
      hasAnalyst: false,
    });
    expect(codeOf(await list(SUBJECT_A, listPath(backtest)))).toBe('RUN_NOT_LIVE');
    expect((await list(SUBJECT_A, `${listPath(runId)}?limit=21`)).status).toBe(400);
  });
});
