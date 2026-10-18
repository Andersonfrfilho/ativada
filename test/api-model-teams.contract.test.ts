// Copyright (c) 2026 Ada Technology. All rights reserved.
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';

import {
  analystAt,
  ANALYST_CANDLE,
  ANALYST_SYMBOL,
  createAnalystRun,
} from './fixtures/analyst-routes/analyst-routes-scenario.fixture.js';
import type { TeamReportRow } from '../packages/database/src/index.js';
import {
  buildModelTeamRoutes,
  ON_DEMAND_PER_DAY,
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

const ME = '/v1/me/model-teams';
const RUNS = '/v1/runs';
const LATEST = { openTime: analystAt(3) as number | undefined };
const CLOSES = ['100', '101', '100', '102'];

type ErrorBody = { error: { code: string; details?: { field: string; reason: string }[] } };
type DataBody<TData> = { data: TData };
type TeamBody = {
  teamKey: string;
  isEnabled: boolean;
  providerStatus: { state: string | null; isAvailable: boolean };
};

let harness: RunsHarness;

beforeAll(async () => {
  harness = await createRunsHarness({
    candles: CLOSES.map((close, index) => ({
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
  harness.modelTeams.state.reportsByCandle = [];
  harness.modelTeams.calls.enqueued.length = 0;
  harness.modelTeams.calls.queries.length = 0;
  harness.clock.now = Date.UTC(2026, 9, 1);
  LATEST.openTime = analystAt(3);
});

async function get(subject: string, path: string): Promise<{ status: number; body: unknown }> {
  return readJson(await harness.call({ subject, path }));
}

async function send(
  subject: string,
  method: string,
  path: string,
  body?: unknown,
): Promise<{ status: number; body: unknown }> {
  return readJson(await harness.call({ subject, method, path, body }));
}

function codeOf(result: { body: unknown }): string {
  return (result.body as ErrorBody).error.code;
}

// Os problemas que o esquema DOCUMENTADO da rota aponta no que a rota devolveu (vazio = bate com o documento).
function issuesOf(method: string, suffix: string, data: unknown): readonly unknown[] {
  const route = harness.routes.find((item) => item.method === method && item.path.endsWith(suffix));
  const parsed = route?.documentation?.successes[0]?.schema?.safeParse(data);
  return parsed === undefined ? ['rota sem esquema'] : (parsed.error?.issues ?? []);
}

function reportRow(
  partial: Partial<TeamReportRow> & Pick<TeamReportRow, 'teamKey' | 'candleTime'>,
): TeamReportRow {
  return {
    id: crypto.randomUUID(),
    kind: 'scheduled',
    status: 'decided',
    failureCode: null,
    action: 'hold',
    entryPrice: null,
    targetPrice: null,
    stopPrice: null,
    confidence: null,
    roles: null,
    isReasonHidden: false,
    latencyMilliseconds: null,
    costUsd: '0',
    requestedAt: new Date(0),
    decidedAt: null,
    ...partial,
  };
}

describe('GET e PATCH /v1/me/model-teams', () => {
  test('exigem token', async () => {
    expect((await harness.call({ path: ME })).status).toBe(401);
    expect((await harness.call({ method: 'PATCH', path: `${ME}/nina`, body: {} })).status).toBe(
      401,
    );
  });

  test('as três equipes nascem DESLIGADAS e sem notícia do worker', async () => {
    const { status, body } = await get(SUBJECT_A, ME);
    expect(status).toBe(200);
    const data = (body as DataBody<{ teams: TeamBody[] }>).data;
    expect(data.teams.map((team) => team.teamKey)).toStrictEqual(['nina', 'lucas', 'olivia']);
    expect(data.teams.every((team) => !team.isEnabled && team.providerStatus.state === null)).toBe(
      true,
    );
    expect(issuesOf('GET', ME, data)).toStrictEqual([]);
  });

  test('o estado do provedor vem do batimento e vira "sem notícia" se o worker parou', async () => {
    harness.modelTeams.state.heartbeat = readyHeartbeat(['nina']);
    const fresh = (await get(SUBJECT_A, ME)).body as DataBody<{ teams: TeamBody[] }>;
    expect(fresh.data.teams[0]?.providerStatus).toMatchObject({
      state: 'ready',
      isAvailable: true,
    });
    harness.modelTeams.state.heartbeat = {
      ...readyHeartbeat(['nina']),
      ageMilliseconds: 3_600_000,
    };
    const stale = (await get(SUBJECT_A, ME)).body as DataBody<{ teams: TeamBody[] }>;
    expect(stale.data.teams[0]?.providerStatus.state).toBeNull();
  });

  test('ligar muda só o dono: o outro usuário continua desligado', async () => {
    const patched = await send(SUBJECT_A, 'PATCH', `${ME}/lucas`, { enabled: true });
    expect(patched.status).toBe(200);
    expect((patched.body as DataBody<TeamBody>).data).toMatchObject({
      teamKey: 'lucas',
      isEnabled: true,
    });
    const mine = (await get(SUBJECT_A, ME)).body as DataBody<{ teams: TeamBody[] }>;
    const theirs = (await get(SUBJECT_B, ME)).body as DataBody<{ teams: TeamBody[] }>;
    expect(mine.data.teams.find((team) => team.teamKey === 'lucas')?.isEnabled).toBe(true);
    expect(theirs.data.teams.some((team) => team.isEnabled)).toBe(false);
    await send(SUBJECT_A, 'PATCH', `${ME}/lucas`, { enabled: false });
  });

  test('chave fora do catálogo é 404 e corpo inválido é 400 sem eco', async () => {
    const unknown = await send(SUBJECT_A, 'PATCH', `${ME}/zeca`, { enabled: true });
    expect([unknown.status, codeOf(unknown)]).toStrictEqual([404, 'MODEL_TEAM_NOT_FOUND']);
    const invalid = await send(SUBJECT_A, 'PATCH', `${ME}/nina`, {
      enabled: 'ValorQueNaoPodeVazar',
    });
    expect(invalid.status).toBe(400);
    expect(JSON.stringify(invalid.body)).not.toContain('ValorQueNaoPodeVazar');
    const extra = await send(SUBJECT_A, 'PATCH', `${ME}/nina`, { enabled: true, price: 1 });
    expect(extra.status).toBe(400);
  });
});

describe('GET /v1/runs/:runId/model-teams', () => {
  test('exige token e entrega o estado das três equipes com no máximo 4 consultas', async () => {
    const runId = await createAnalystRun(harness, { subject: SUBJECT_A });
    expect((await harness.call({ path: `${RUNS}/${runId}/model-teams` })).status).toBe(401);
    harness.queries.length = 0;
    const { status, body } = await get(SUBJECT_A, `${RUNS}/${runId}/model-teams`);
    expect(status).toBe(200);
    const data = (body as DataBody<{ teams: unknown[]; signalSource: unknown; symbol: string }>)
      .data;
    expect(data.teams).toHaveLength(3);
    expect(data.signalSource).toBeNull();
    expect(data.symbol).toBe(ANALYST_SYMBOL);
    expect(harness.queries.length + harness.modelTeams.calls.queries.length).toBeLessThanOrEqual(4);
    expect(issuesOf('GET', '/:runId/model-teams', data)).toStrictEqual([]);
  });

  test('execução alheia, inexistente e id malformado são o MESMO 404; outro tipo é 409 RUN_NOT_LIVE', async () => {
    const runId = await createAnalystRun(harness, { subject: SUBJECT_A });
    await expectIndistinguishableNotFound({
      foreignResourceResponse: await harness.call({
        subject: SUBJECT_B,
        path: `${RUNS}/${runId}/model-teams`,
      }),
      missingResourceResponse: await harness.call({
        subject: SUBJECT_B,
        path: `${RUNS}/${MISSING_ID}/model-teams`,
      }),
      expectedCode: 'RUN_NOT_FOUND',
    });
    const backtest = await createAnalystRun(harness, {
      subject: SUBJECT_A,
      kind: 'backtest',
      hasAnalyst: false,
    });
    const notLive = await get(SUBJECT_A, `${RUNS}/${backtest}/model-teams`);
    expect([notLive.status, codeOf(notLive)]).toStrictEqual([409, 'RUN_NOT_LIVE']);
  });

  test('opinionIds malformado é 400 sem eco; os ids acompanhados chegam à consulta', async () => {
    const runId = await createAnalystRun(harness, { subject: SUBJECT_A });
    const bad = await get(
      SUBJECT_A,
      `${RUNS}/${runId}/model-teams?opinionIds=ValorQueNaoPodeVazar`,
    );
    expect(bad.status).toBe(400);
    expect(JSON.stringify(bad.body)).not.toContain('ValorQueNaoPodeVazar');
    harness.modelTeams.calls.overview.length = 0;
    await get(SUBJECT_A, `${RUNS}/${runId}/model-teams?opinionIds=${MISSING_ID}`);
    expect(harness.modelTeams.calls.overview[0]?.onDemandIds).toStrictEqual([MISSING_ID]);
  });
});

describe('POST /v1/runs/:runId/model-teams/:teamKey/opinions', () => {
  async function ready(subject = SUBJECT_A, teamKey = 'nina'): Promise<string> {
    harness.modelTeams.enable(harness.scopeOf(subject), teamKey);
    harness.modelTeams.state.heartbeat = readyHeartbeat([teamKey]);
    return createAnalystRun(harness, { subject });
  }
  const opinions = (runId: string, teamKey = 'nina'): string =>
    `${RUNS}/${runId}/model-teams/${teamKey}/opinions`;
  // A política é de 5 por 10 min: cada pedido isolado cai numa janela nova (o limitador usa o relógio do harness).
  async function ask(subject: string, path: string): ReturnType<typeof send> {
    harness.clock.now += 11 * 60_000;
    return send(subject, 'POST', path);
  }

  test('exige token; execução alheia e inexistente são o mesmo 404 e nada é enfileirado', async () => {
    const runId = await ready();
    expect((await harness.call({ method: 'POST', path: opinions(runId) })).status).toBe(401);
    await expectIndistinguishableNotFound({
      foreignResourceResponse: await harness.call({
        subject: SUBJECT_B,
        method: 'POST',
        path: opinions(runId),
      }),
      missingResourceResponse: await harness.call({
        subject: SUBJECT_B,
        method: 'POST',
        path: opinions(MISSING_ID),
      }),
      expectedCode: 'RUN_NOT_FOUND',
    });
    expect(harness.modelTeams.calls.enqueued).toHaveLength(0);
  });

  test('o caminho feliz enfileira um pedido avulso na última vela fechada e responde 202 com o id', async () => {
    const runId = await ready();
    const { status, body } = await ask(SUBJECT_A, opinions(runId));
    expect(status).toBe(202);
    const { opinionId } = (body as DataBody<{ opinionId: string }>).data;
    expect(harness.modelTeams.calls.enqueued).toStrictEqual([
      {
        teamKey: 'nina',
        provider: 'google',
        symbol: ANALYST_SYMBOL,
        candleTime: analystAt(3),
        id: opinionId,
      },
    ]);
  });

  test('as recusas, na ordem: chave 404, tipo 409, sem analista 409, parada 409, desligada 409, provedor fora 409', async () => {
    const runId = await ready();
    expect(codeOf(await ask(SUBJECT_A, opinions(runId, 'zeca')))).toBe('MODEL_TEAM_NOT_FOUND');
    const backtest = await createAnalystRun(harness, {
      subject: SUBJECT_A,
      kind: 'backtest',
      hasAnalyst: false,
    });
    expect(codeOf(await ask(SUBJECT_A, opinions(backtest)))).toBe('RUN_NOT_LIVE');
    const bare = await createAnalystRun(harness, { subject: SUBJECT_A, hasAnalyst: false });
    expect(codeOf(await ask(SUBJECT_A, opinions(bare)))).toBe('ANALYST_NOT_ENABLED');
    const stopped = await createAnalystRun(harness, { subject: SUBJECT_A, status: 'queued' });
    expect(codeOf(await ask(SUBJECT_A, opinions(stopped)))).toBe('RUN_NOT_RUNNING');
    expect(codeOf(await ask(SUBJECT_A, opinions(runId, 'lucas')))).toBe('MODEL_TEAM_DISABLED');
    harness.modelTeams.state.heartbeat = undefined;
    expect(codeOf(await ask(SUBJECT_A, opinions(runId)))).toBe('MODEL_TEAM_UNAVAILABLE');
    LATEST.openTime = undefined;
    harness.modelTeams.state.heartbeat = readyHeartbeat(['nina']);
    expect(codeOf(await ask(SUBJECT_A, opinions(runId)))).toBe('MODEL_TEAM_UNAVAILABLE');
    expect(harness.modelTeams.calls.enqueued).toHaveLength(0);
  });

  test('a equipe ligada de outro usuário não vale; o teto diário é do usuário e o 429 não enfileira', async () => {
    const runB = await ready(SUBJECT_B, 'olivia');
    const runA = await createAnalystRun(harness, { subject: SUBJECT_A });
    harness.modelTeams.state.heartbeat = readyHeartbeat(['olivia']);
    expect(codeOf(await ask(SUBJECT_A, opinions(runA, 'olivia')))).toBe('MODEL_TEAM_DISABLED');
    for (let used = 0; used < ON_DEMAND_PER_DAY; used += 1) {
      expect((await ask(SUBJECT_B, opinions(runB, 'olivia'))).status).toBe(202);
    }
    const over = await ask(SUBJECT_B, opinions(runB, 'olivia'));
    expect([over.status, codeOf(over)]).toStrictEqual([429, 'MODEL_OPINION_LIMIT_REACHED']);
    expect(harness.modelTeams.calls.enqueued).toHaveLength(ON_DEMAND_PER_DAY);
    harness.clock.now += 24 * 3_600_000;
    expect((await ask(SUBJECT_B, opinions(runB, 'olivia'))).status).toBe(202);
  });

  test('rajada na mesma janela de 10 minutos acaba em 429 RATE_LIMITED (a política é de 5 por usuário)', async () => {
    const runId = await ready(SUBJECT_A);
    harness.clock.now += 11 * 60_000;
    const codes: string[] = [];
    for (let sent = 0; sent < 6; sent += 1) {
      const result = await send(SUBJECT_A, 'POST', opinions(runId));
      codes.push(result.status === 202 ? 'ACCEPTED' : codeOf(result));
    }
    expect(codes[0]).not.toBe('RATE_LIMITED');
    expect(codes[5]).toBe('RATE_LIMITED');
  });
});

describe('GET /v1/runs/:runId/model-teams/comparison', () => {
  const comparison = (runId: string, query = ''): string =>
    `${RUNS}/${runId}/model-teams/comparison${query}`;

  test('a vela seguinte decide o ✓/✗ de cada equipe; vela aberta e "esperar" ficam sem marca', async () => {
    const runId = await createAnalystRun(harness, { subject: SUBJECT_A, lastCandleIndex: 3 });
    harness.modelTeams.state.reportsByCandle = [
      reportRow({ teamKey: 'nina', candleTime: analystAt(2), action: 'buy' }),
      reportRow({ teamKey: 'lucas', candleTime: analystAt(1), action: 'sell' }),
      reportRow({ teamKey: 'olivia', candleTime: analystAt(1), action: 'buy' }),
      reportRow({ teamKey: 'nina', candleTime: analystAt(3), action: 'buy' }),
      reportRow({ teamKey: 'lucas', candleTime: analystAt(2), action: 'hold' }),
    ];
    const { status, body } = await get(SUBJECT_A, comparison(runId));
    expect(status).toBe(200);
    const items = (
      body as DataBody<
        { candleTime: number; next: string; teams: { teamKey: string; isHit: boolean | null }[] }[]
      >
    ).data;
    expect(items.map((item) => item.next)).toStrictEqual(['open', 'up', 'down', 'up']);
    const hit = (index: number, team: string): boolean | null | undefined =>
      items[index]?.teams.find((row) => row.teamKey === team)?.isHit;
    expect([
      hit(0, 'nina'),
      hit(1, 'nina'),
      hit(1, 'lucas'),
      hit(2, 'lucas'),
      hit(2, 'olivia'),
    ]).toStrictEqual([null, true, null, true, false]);
    expect(issuesOf('GET', '/comparison', items)).toStrictEqual([]);
  });

  test('página por cursor sem repetir; limite e cursor inválidos são 400 sem eco', async () => {
    const runId = await createAnalystRun(harness, { subject: SUBJECT_A, lastCandleIndex: 3 });
    const first = await get(SUBJECT_A, comparison(runId, '?limit=2'));
    const page = first.body as DataBody<{ candleTime: number }[]> & {
      pagination: { nextCursor: string | null };
    };
    expect(page.data.map((item) => item.candleTime)).toStrictEqual([analystAt(3), analystAt(2)]);
    const cursor = page.pagination.nextCursor ?? '';
    const second = await get(SUBJECT_A, comparison(runId, `?limit=2&cursor=${cursor}`));
    expect(
      (second.body as DataBody<{ candleTime: number }[]>).data.map((item) => item.candleTime),
    ).toStrictEqual([analystAt(1), analystAt(0)]);
    expect((await get(SUBJECT_A, comparison(runId, '?limit=49'))).status).toBe(400);
    const bad = await get(SUBJECT_A, comparison(runId, '?cursor=ValorQueNaoPodeVazar'));
    expect(bad.status).toBe(400);
    expect(JSON.stringify(bad.body)).not.toContain('ValorQueNaoPodeVazar');
  });

  test('execução alheia e inexistente são o mesmo 404; sem vela ainda a página é vazia', async () => {
    const runId = await createAnalystRun(harness, { subject: SUBJECT_A });
    await expectIndistinguishableNotFound({
      foreignResourceResponse: await harness.call({ subject: SUBJECT_B, path: comparison(runId) }),
      missingResourceResponse: await harness.call({
        subject: SUBJECT_B,
        path: comparison(MISSING_ID),
      }),
      expectedCode: 'RUN_NOT_FOUND',
    });
    expect((await get(SUBJECT_A, comparison(runId))).body).toMatchObject({ data: [] });
  });
});
