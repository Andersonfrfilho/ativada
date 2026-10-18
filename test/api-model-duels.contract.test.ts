// Copyright (c) 2026 Ada Technology. All rights reserved.
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';

import { buildModelTeamRoutes } from './fixtures/api-routes/model-team-routes.fixture.js';
import {
  buildHourlyCandles,
  createRunsHarness,
  MISSING_ID,
  readJson,
  SUBJECT_A,
  SUBJECT_B,
  USER_A_ID,
  type RunsHarness,
} from './fixtures/api-routes/runs-harness.fixture.js';
import { expectIndistinguishableNotFound } from './fixtures/not-found-response.fixture.js';

const DUELS = '/v1/model-duels';
const PERIOD_START = Date.UTC(2024, 0, 1);
const LATEST = { openTime: undefined as number | undefined };

type ErrorBody = { error: { code: string; details?: { field: string; reason: string }[] } };
type RunItem = { runId: string; team: string | null; signalSource: unknown; status: string };
type Created = { data: { duelId: string; symbol: string; timeframe: string; runs: RunItem[] } };

let harness: RunsHarness;

beforeAll(async () => {
  harness = await createRunsHarness({
    candles: buildHourlyCandles({ symbol: 'BTCUSDT', count: 48, firstOpenTime: PERIOD_START }),
    extraRoutes: (app, parts) => buildModelTeamRoutes(app, parts, { latest: LATEST }),
  });
});

afterAll(async () => {
  await harness.stop();
});

beforeEach(() => {
  for (const run of harness.runs.all()) {
    if (run.status === 'queued' || run.status === 'running') {
      harness.runs.updateRun(run.id, { status: 'cancelled', finishedAt: new Date() });
    }
  }
  harness.limits.clear();
  harness.clock.now += 61 * 60_000;
});

function duelBody(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return { symbol: 'BTCUSDT', startingBalance: '1000', teams: ['nina', 'lucas'], ...overrides };
}

async function create(subject: string, body: unknown): Promise<{ status: number; body: unknown }> {
  return readJson(await harness.call({ subject, method: 'POST', path: DUELS, body }));
}

function enable(subject: string, teams: readonly string[]): void {
  for (const team of teams) harness.modelTeams.enable(harness.scopeOf(subject), team);
}

function codeOf(result: { body: unknown }): string {
  return (result.body as ErrorBody).error.code;
}

function issuesOf(method: string, path: string, data: unknown): readonly unknown[] {
  const route = harness.routes.find((item) => item.method === method && item.path === path);
  const parsed = route?.documentation?.successes[0]?.schema?.safeParse(data);
  return parsed === undefined ? ['rota sem esquema'] : (parsed.error?.issues ?? []);
}

describe('POST /v1/model-duels', () => {
  test('exige token', async () => {
    const response = await harness.call({ method: 'POST', path: DUELS, body: duelBody() });
    expect(response.status).toBe(401);
  });

  test('cria uma execução por equipe, no mesmo par, vela e saldo, ligadas pelo mesmo duelo', async () => {
    enable(SUBJECT_A, ['nina', 'lucas']);
    const { status, body } = await create(SUBJECT_A, duelBody());
    expect(status).toBe(201);
    const { data } = body as Created;
    expect(data).toMatchObject({ symbol: 'BTCUSDT', timeframe: '15m' });
    expect(data.runs.map((run) => run.team)).toStrictEqual(['nina', 'lucas']);
    expect(issuesOf('POST', DUELS, data)).toStrictEqual([]);
    const stored = data.runs.map((run) => harness.runs.all().find((item) => item.id === run.runId));
    expect(new Set(stored.map((run) => run?.periodStart)).size).toBe(1);
    expect(new Set(stored.map((run) => JSON.stringify(run?.runParameters))).size).toBe(1);
    expect(stored.every((run) => JSON.stringify(run?.request).includes(data.duelId))).toBe(true);
  });

  test('com a estratégia de regras do usuário entra uma execução a mais, sem equipe', async () => {
    enable(SUBJECT_A, ['olivia']);
    const mine = await harness.seedStrategy(SUBJECT_A, 'duel');
    const { status, body } = await create(
      SUBJECT_A,
      duelBody({ teams: ['olivia'], withMyStrategy: { strategyVersionId: mine.versionId } }),
    );
    expect(status).toBe(201);
    expect((body as Created).data.runs.map((run) => run.team)).toStrictEqual(['olivia', null]);
  });

  test('equipe desligada: 409 MODEL_TEAM_DISABLED e nenhuma execução nasce', async () => {
    enable(SUBJECT_B, ['nina']);
    const before = harness.runs.all().length;
    const result = await create(SUBJECT_B, duelBody({ teams: ['nina', 'olivia'] }));
    expect([result.status, codeOf(result)]).toStrictEqual([409, 'MODEL_TEAM_DISABLED']);
    expect(harness.runs.all().length).toBe(before);
  });

  test('sem vaga para TODAS as execuções: 409 LIVE_RUN_LIMIT_REACHED e nada é criado', async () => {
    enable(SUBJECT_A, ['nina', 'lucas']);
    harness.limits.set(USER_A_ID, { maxActiveLivePaperRuns: 1 });
    const before = harness.runs.all().length;
    const result = await create(SUBJECT_A, duelBody());
    expect([result.status, codeOf(result)]).toStrictEqual([409, 'LIVE_RUN_LIMIT_REACHED']);
    expect(harness.runs.all().length).toBe(before);
  });

  test('a estratégia de outro usuário é 404 e as execuções já criadas são canceladas', async () => {
    enable(SUBJECT_A, ['nina']);
    const foreign = await harness.seedStrategy(SUBJECT_B, 'alheia');
    const result = await create(
      SUBJECT_A,
      duelBody({ teams: ['nina'], withMyStrategy: { strategyVersionId: foreign.versionId } }),
    );
    expect([result.status, codeOf(result)]).toStrictEqual([404, 'STRATEGY_VERSION_NOT_FOUND']);
    const active = harness.runs.all().filter((run) => ['queued', 'running'].includes(run.status));
    expect(active).toHaveLength(0);
  });

  test('quatro duelos na mesma hora: o 4º é 429 RATE_LIMITED (a política é de 3 por hora)', async () => {
    enable(SUBJECT_A, ['nina']);
    const codes: string[] = [];
    for (let sent = 0; sent < 4; sent += 1) {
      const result = await create(SUBJECT_A, duelBody({ teams: ['nina'] }));
      codes.push(result.status === 201 ? 'CREATED' : codeOf(result));
      for (const run of harness.runs.all()) {
        harness.runs.updateRun(run.id, { status: 'cancelled', finishedAt: new Date() });
      }
    }
    expect(codes).toStrictEqual(['CREATED', 'CREATED', 'CREATED', 'RATE_LIMITED']);
  });

  test.each([
    ['equipe repetida', { teams: ['nina', 'nina'] }],
    ['sem equipes', { teams: [] }],
    ['quatro equipes', { teams: ['nina', 'lucas', 'olivia', 'nina'] }],
    ['equipe fora do catálogo', { teams: ['zeca'] }],
    ['par desabilitado', { symbol: 'DOGEUSDT' }],
    ['saldo ilegível', { startingBalance: 'ValorQueNaoPodeVazar' }],
    ['campo desconhecido', { timeframe: '1h' }],
  ])('%s é 400 sem eco e nada é criado', async (_name, overrides) => {
    enable(SUBJECT_A, ['nina', 'lucas', 'olivia']);
    const before = harness.runs.all().length;
    const result = await create(SUBJECT_A, duelBody(overrides));
    expect(result.status).toBe(400);
    expect(JSON.stringify(result.body)).not.toContain('ValorQueNaoPodeVazar');
    expect(harness.runs.all().length).toBe(before);
  });
});

describe('GET /v1/model-duels/:duelId', () => {
  async function newDuel(subject: string): Promise<Created['data']> {
    enable(subject, ['nina', 'lucas']);
    return ((await create(subject, duelBody())).body as Created).data;
  }
  const read = (subject: string, duelId: string): Promise<Response> =>
    harness.call({ subject, path: `${DUELS}/${duelId}` });

  test('exige token; duelo alheio, inexistente e id malformado são o MESMO 404', async () => {
    const duel = await newDuel(SUBJECT_A);
    expect((await harness.call({ path: `${DUELS}/${duel.duelId}` })).status).toBe(401);
    await expectIndistinguishableNotFound({
      foreignResourceResponse: await read(SUBJECT_B, duel.duelId),
      missingResourceResponse: await read(SUBJECT_B, MISSING_ID),
      expectedCode: 'DUEL_NOT_FOUND',
    });
    await expectIndistinguishableNotFound({
      foreignResourceResponse: await read(SUBJECT_B, duel.duelId),
      missingResourceResponse: await read(SUBJECT_B, 'nao-e-um-id'),
      expectedCode: 'DUEL_NOT_FOUND',
    });
  });

  test('o dono vê as execuções, as curvas alinhadas por vela e o ranking calculado das curvas', async () => {
    const duel = await newDuel(SUBJECT_A);
    const first = duel.runs[0]?.runId ?? '';
    harness.modelTeams.state.equityPoints = [
      { userId: USER_A_ID, runId: first, candleTime: 1_000, equity: '1010', equityAtLow: '1000' },
      { userId: USER_A_ID, runId: first, candleTime: 2_000, equity: '1020', equityAtLow: '990' },
    ];
    const { status, body } = await readJson(await read(SUBJECT_A, duel.duelId));
    expect(status).toBe(200);
    const { data } = body as {
      data: {
        candleTimes: number[];
        curves: { runId: string; equity: (string | null)[] }[];
        ranking: {
          runId: string;
          team: string | null;
          returnRate: string | null;
          maxDrawdown: string | null;
          scoreboard: unknown;
        }[];
      };
    };
    expect(data.candleTimes).toStrictEqual([1_000, 2_000]);
    expect(data.curves.find((curve) => curve.runId === first)?.equity).toStrictEqual([
      '1010',
      '1020',
    ]);
    expect(data.curves.find((curve) => curve.runId !== first)?.equity).toStrictEqual([null, null]);
    const row = data.ranking.find((item) => item.runId === first);
    expect(row).toMatchObject({ team: 'nina', returnRate: '0.02', maxDrawdown: '0.02941177' });
    expect(data.ranking.find((item) => item.runId !== first)?.returnRate).toBeNull();
    expect(issuesOf('GET', `${DUELS}/:duelId`, data)).toStrictEqual([]);
    harness.modelTeams.state.equityPoints = [];
  });

  test('a curva de outro usuário nunca entra no duelo', async () => {
    const duel = await newDuel(SUBJECT_A);
    const first = duel.runs[0]?.runId ?? '';
    harness.modelTeams.state.equityPoints = [
      { userId: 'outro-usuario', runId: first, candleTime: 1_000, equity: '5', equityAtLow: '5' },
    ];
    const { body } = await readJson(await read(SUBJECT_A, duel.duelId));
    expect((body as { data: { candleTimes: number[] } }).data.candleTimes).toStrictEqual([]);
    harness.modelTeams.state.equityPoints = [];
  });
});
