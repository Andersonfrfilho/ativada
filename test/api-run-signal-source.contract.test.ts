// Copyright (c) 2026 Ada Technology. All rights reserved.
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';

import { MODEL_TEAM_STRATEGY, readSignalSource } from '../packages/model-agents/src/index.js';
import {
  buildHourlyCandles,
  createRunsHarness,
  MISSING_ID,
  readJson,
  SUBJECT_A,
  SUBJECT_B,
  type RunsHarness,
} from './fixtures/api-routes/runs-harness.fixture.js';
import { expectIndistinguishableNotFound } from './fixtures/not-found-response.fixture.js';

const RUNS = '/v1/runs';
const STRATEGIES = '/v1/strategies';
const PERIOD_START = Date.UTC(2024, 0, 1);
const SOURCE = { kind: 'model_team', team: 'nina' } as const;

type ErrorBody = { error: { code: string; details?: { field: string; reason: string }[] } };
type RunBody = { data: { id: string; signalSource: unknown; duelId: unknown } };

let harness: RunsHarness;

beforeAll(async () => {
  harness = await createRunsHarness({
    candles: buildHourlyCandles({ symbol: 'BTCUSDT', count: 48, firstOpenTime: PERIOD_START }),
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
  harness.clock.now = Date.UTC(2026, 9, 1);
});

function teamBody(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    kind: 'live_paper',
    symbol: 'BTCUSDT',
    timeframe: '15m',
    signalSource: SOURCE,
    ...overrides,
  };
}

async function post(subject: string, body: unknown): Promise<{ status: number; body: unknown }> {
  return readJson(await harness.call({ subject, method: 'POST', path: RUNS, body }));
}

function enable(subject: string, teamKey = 'nina'): void {
  harness.modelTeams.enable(harness.scopeOf(subject), teamKey);
}

function detailsOf(body: unknown): readonly { field: string; reason: string }[] {
  return (body as ErrorBody).error.details ?? [];
}

describe('POST /v1/runs com signalSource (spec 015, plan D9)', () => {
  test('equipe ligada: nasce a execução de equipe com a versão fixa do sistema, sem estratégia do usuário', async () => {
    enable(SUBJECT_A);
    const created = await post(SUBJECT_A, teamBody());
    expect(created.status).toBe(202);
    const data = (created.body as RunBody).data;
    expect(data.signalSource).toStrictEqual(SOURCE);
    expect(data.duelId).toBeNull();
    const stored = harness.runs.all().find((candidate) => candidate.id === data.id);
    expect(readSignalSource(stored?.request)).toStrictEqual(SOURCE);
    const version = await harness.strategies.repository.findVersion(
      harness.scopeOf(SUBJECT_A),
      stored?.strategyVersionId ?? '',
    );
    expect(version?.configHash).toBe(MODEL_TEAM_STRATEGY.configHash);
  });

  test('a versão do sistema não aparece na lista de estratégias e se repete entre execuções do dono', async () => {
    enable(SUBJECT_A);
    const before = await readJson(await harness.call({ subject: SUBJECT_A, path: STRATEGIES }));
    const first = await post(SUBJECT_A, teamBody());
    const second = await post(SUBJECT_A, teamBody());
    expect([first.status, second.status]).toStrictEqual([202, 202]);
    const ids = [first, second].map((item) => (item.body as RunBody).data.id);
    const versions = harness.runs
      .all()
      .filter((run) => ids.includes(run.id))
      .map((run) => run.strategyVersionId);
    expect(new Set(versions).size).toBe(1);
    const after = await readJson(await harness.call({ subject: SUBJECT_A, path: STRATEGIES }));
    expect(after.body).toStrictEqual(before.body);
  });

  test('cada usuário tem a sua versão do sistema; a execução de um é 404 para o outro', async () => {
    enable(SUBJECT_A);
    enable(SUBJECT_B);
    const a = await post(SUBJECT_A, teamBody());
    const b = await post(SUBJECT_B, teamBody());
    const runA = (a.body as RunBody).data.id;
    const runB = (b.body as RunBody).data.id;
    const stored = (id: string): string | undefined =>
      harness.runs.all().find((run) => run.id === id)?.strategyVersionId;
    expect(stored(runA)).not.toBe(stored(runB));
    await expectIndistinguishableNotFound({
      foreignResourceResponse: await harness.call({ subject: SUBJECT_B, path: `${RUNS}/${runA}` }),
      missingResourceResponse: await harness.call({
        subject: SUBJECT_B,
        path: `${RUNS}/${MISSING_ID}`,
      }),
      expectedCode: 'RUN_NOT_FOUND',
    });
  });

  test('equipe desligada: 409 MODEL_TEAM_DISABLED e nenhuma execução criada', async () => {
    const before = harness.runs.all().length;
    const { status, body } = await post(
      SUBJECT_B,
      teamBody({ signalSource: { ...SOURCE, team: 'lucas' } }),
    );
    expect(status).toBe(409);
    expect((body as ErrorBody).error.code).toBe('MODEL_TEAM_DISABLED');
    expect(harness.runs.all().length).toBe(before);
  });

  test('a equipe ligada de outro usuário não vale para este', async () => {
    enable(SUBJECT_A, 'olivia');
    const { status, body } = await post(
      SUBJECT_B,
      teamBody({ signalSource: { ...SOURCE, team: 'olivia' } }),
    );
    expect(status).toBe(409);
    expect((body as ErrorBody).error.code).toBe('MODEL_TEAM_DISABLED');
  });

  test.each([
    ['goalId', { goalId: MISSING_ID }, 'goalId'],
    ['analyst', { analyst: { mode: 'shadow' } }, 'analyst'],
    ['strategyVersionId', { strategyVersionId: MISSING_ID }, 'strategyVersionId'],
  ])('%s junto de signalSource é 400 e nada é criado', async (_name, extra, field) => {
    enable(SUBJECT_A);
    const before = harness.runs.all().length;
    const { status, body } = await post(SUBJECT_A, teamBody(extra));
    expect(status).toBe(400);
    expect(detailsOf(body)).toContainEqual({ field, reason: 'not_allowed_with_signal_source' });
    expect(harness.runs.all().length).toBe(before);
  });

  test('só ao vivo e só em vela de 15 min', async () => {
    enable(SUBJECT_A);
    const hourly = await post(SUBJECT_A, teamBody({ timeframe: '1h' }));
    expect(hourly.status).toBe(400);
    expect(detailsOf(hourly.body)).toContainEqual({
      field: 'signalSource',
      reason: 'signal_source_requires_15m_timeframe',
    });
    const backtest = await post(
      SUBJECT_A,
      teamBody({
        kind: 'backtest',
        periodStart: PERIOD_START,
        periodEnd: PERIOD_START + 86_400_000,
      }),
    );
    expect(backtest.status).toBe(400);
    expect(detailsOf(backtest.body).map((item) => item.field)).toContain('signalSource');
  });

  test('equipe fora do catálogo, corpo sem versão e grupo de duelo no corpo público são 400', async () => {
    enable(SUBJECT_A);
    const unknown = await post(SUBJECT_A, teamBody({ signalSource: { ...SOURCE, team: 'zeca' } }));
    expect(unknown.status).toBe(400);
    expect(JSON.stringify(unknown.body)).not.toContain('zeca');
    const bare = await post(SUBJECT_A, teamBody({ signalSource: undefined }));
    expect(bare.status).toBe(400);
    expect(detailsOf(bare.body)).toContainEqual({ field: 'strategyVersionId', reason: 'required' });
    const duel = await post(SUBJECT_A, teamBody({ duelGroupId: crypto.randomUUID() }));
    expect(duel.status).toBe(400);
  });
});
