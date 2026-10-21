// Copyright (c) 2026 Ada Technology. All rights reserved.
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';

import {
  buildHourlyCandles,
  createRunsHarness,
  MISSING_ID,
  readJson,
  SUBJECT_A,
  SUBJECT_B,
  type RunsHarness,
} from './fixtures/api-routes/runs-harness.fixture.js';

const RUNS = '/v1/runs';
const PERIOD_START = Date.UTC(2024, 0, 1);

type ViewBody = { data: Record<string, unknown> };

let harness: RunsHarness;
let teamRunId: string;

beforeAll(async () => {
  harness = await createRunsHarness({
    candles: buildHourlyCandles({ symbol: 'BTCUSDT', count: 48, firstOpenTime: PERIOD_START }),
  });
  harness.modelTeams.enable(harness.scopeOf(SUBJECT_A), 'nina');
  const created = await readJson(
    await harness.call({
      subject: SUBJECT_A,
      method: 'POST',
      path: RUNS,
      body: {
        kind: 'live_paper',
        symbol: 'BTCUSDT',
        timeframe: '15m',
        signalSource: { kind: 'model_team', team: 'nina' },
      },
    }),
  );
  teamRunId = (created.body as ViewBody).data['id'] as string;
});

afterAll(async () => {
  await harness.stop();
});

async function read(subject: string, runId: string, suffix: string): Promise<ViewBody> {
  const { status, body } = await readJson(
    await harness.call({ subject, path: `${RUNS}/${runId}/${suffix}` }),
  );
  expect(status).toBe(200);
  return body as ViewBody;
}

function documented(suffix: string, data: unknown): boolean {
  const route = harness.routes.find((candidate) => candidate.path.endsWith(`/:runId/${suffix}`));
  return route?.documentation?.successes[0]?.schema?.safeParse(data).success === true;
}

describe('execução de equipe nas leituras de regra (spec 015, plan D9)', () => {
  test('live-status: os gatilhos dizem team_run, sem régua de placar', async () => {
    const { data } = await read(SUBJECT_A, teamRunId, 'live-status');
    expect(data['triggers']).toMatchObject({ status: 'unavailable', reason: 'team_run' });
    expect(documented('live-status', data)).toBe(true);
  });

  test('projections: a primeira página diz team_run e não consulta previsões', async () => {
    harness.queries.length = 0;
    const { data } = await read(SUBJECT_A, teamRunId, 'projections');
    expect(data['current']).toMatchObject({ status: 'unavailable', reason: 'team_run' });
    expect(data['items']).toStrictEqual([]);
    expect(harness.queries).toStrictEqual(['findRun', 'findVersion']);
    expect(documented('projections', data)).toBe(true);
  });

  test('strategy-layers: listas vazias com unavailable team_run', async () => {
    const { data } = await read(SUBJECT_A, teamRunId, 'strategy-layers');
    expect(data['unavailable']).toBe('team_run');
    expect(data['lines']).toStrictEqual([]);
    expect(documented('strategy-layers', data)).toBe(true);
  });

  test('outro usuário recebe o mesmo 404 em cada leitura', async () => {
    for (const suffix of ['live-status', 'projections', 'strategy-layers']) {
      const foreign = await harness.call({
        subject: SUBJECT_B,
        path: `${RUNS}/${teamRunId}/${suffix}`,
      });
      const missing = await harness.call({
        subject: SUBJECT_B,
        path: `${RUNS}/${MISSING_ID}/${suffix}`,
      });
      expect(foreign.status).toBe(404);
      expect(await foreign.text()).toBe(await missing.text());
    }
  });
});
