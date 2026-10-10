// Copyright (c) 2026 Ada Technology. All rights reserved.
import {
  createRunRepository,
  resolveUserBySubject,
  RUN_KIND,
  USER_RESOLUTION_STATUS,
} from '../../packages/database/src/index.js';
import { loadClassicScoreboard } from '../../test/fixtures/strategy-engine/engine-scenarios.fixture.js';
import {
  createApiRunsContext,
  type ApiRunsContext,
} from '../api-runs-test/api-runs-test-context.js';
import { dataOf } from '../api-runs-test/api-runs-helpers.js';
import { SYMBOL } from './queue-test.constant.js';
import {
  assertCondition,
  reportLine,
  type BacktestWindow,
  type QueueTestContext,
} from './queue-test-context.js';

const ADMIN_CLAIMS = { realm_access: { roles: ['user', 'admin'] }, acr: '2' };
const QUEUE_LIMIT = 3;
const LIVE_LIMIT = 5;

type RunView = {
  readonly id: string;
  readonly status: string;
  readonly queuePosition: { readonly own: number; readonly overall: number } | null;
};

async function createVersion(api: ApiRunsContext, subject: string): Promise<string> {
  const created = dataOf<{ version: { id: string } }>(
    await api.call({
      subject,
      method: 'POST',
      path: '/v1/strategies',
      body: { name: 'Fila', config: loadClassicScoreboard() },
    }),
    201,
  );
  return created.version.id;
}

async function postBacktest(
  api: ApiRunsContext,
  params: { readonly subject: string; readonly versionId: string; readonly window: BacktestWindow },
): ReturnType<ApiRunsContext['call']> {
  return api.call({
    subject: params.subject,
    method: 'POST',
    path: '/v1/runs',
    body: {
      strategyVersionId: params.versionId,
      kind: 'backtest',
      symbol: SYMBOL,
      timeframe: '1h',
      ...params.window,
    },
  });
}

async function readRun(api: ApiRunsContext, subject: string, runId: string): Promise<RunView> {
  return dataOf<RunView>(await api.call({ subject, path: `/v1/runs/${runId}` }), 200);
}

async function checkQueueLimits(api: ApiRunsContext, context: QueueTestContext): Promise<void> {
  const subject = 'subject-queue-api-limits';
  const versionId = await createVersion(api, subject);
  const accepted = [];
  for (let index = 0; index < QUEUE_LIMIT; index += 1) {
    accepted.push(await postBacktest(api, { subject, versionId, window: context.heavy }));
  }
  assertCondition(
    accepted.every((response) => response.status === 202),
    'dentro da fila: 202',
  );
  const full = await postBacktest(api, { subject, versionId, window: context.heavy });
  const code = (full.json as { error: { code: string } }).error.code;
  assertCondition(
    full.status === 429 && code === 'RUN_QUEUE_FULL',
    `fila cheia: ${full.status} ${code}`,
  );
  const resolution = await resolveUserBySubject(context.handle, subject);
  if (resolution.status !== USER_RESOLUTION_STATUS.ACTIVE) throw new Error('usuário não ativo');
  const runs = createRunRepository(context.handle);
  for (let index = 0; index < LIVE_LIMIT; index += 1) {
    await runs.createRun(resolution.scope, {
      strategyVersionId: versionId,
      kind: RUN_KIND.LIVE_PAPER,
      symbol: SYMBOL,
      timeframe: '1h',
      runParameters: { symbol: SYMBOL },
      runHash: '0'.repeat(64),
      engineVersion: 'engine-2',
      signalEngineVersion: 'signal-2',
      metricsVersion: 'metrics-1',
      periodStart: context.heavy.periodStart,
      periodEnd: undefined,
      migratedFromRunId: undefined,
    });
  }
  const live = await api.call({
    subject,
    method: 'POST',
    path: '/v1/runs',
    body: {
      strategyVersionId: versionId,
      kind: 'live_paper',
      symbol: SYMBOL,
      timeframe: '1h',
      ...context.heavy,
    },
  });
  const liveCode = (live.json as { error: { code: string } }).error.code;
  assertCondition(
    live.status === 409 && liveCode === 'LIVE_RUN_LIMIT_REACHED',
    `simulação ao vivo acima do teto: ${live.status} ${liveCode}`,
  );
  reportLine(
    `(vi) tetos pela API: ${QUEUE_LIMIT} na fila aceitas (202) e a seguinte 429 RUN_QUEUE_FULL; ${LIVE_LIMIT} simulações ao vivo ativas e a seguinte 409 LIVE_RUN_LIMIT_REACHED`,
  );
}

async function checkPositionsAndHealth(
  api: ApiRunsContext,
  context: QueueTestContext,
): Promise<void> {
  const ana = 'subject-queue-api-ana';
  const bia = 'subject-queue-api-bia';
  const anaVersion = await createVersion(api, ana);
  const biaVersion = await createVersion(api, bia);
  const anaRuns = [];
  for (let index = 0; index < 3; index += 1) {
    anaRuns.push(
      dataOf<RunView>(
        await postBacktest(api, { subject: ana, versionId: anaVersion, window: context.heavy }),
        202,
      ),
    );
  }
  const biaRun = dataOf<RunView>(
    await postBacktest(api, { subject: bia, versionId: biaVersion, window: context.heavy }),
    202,
  );
  const [, second, third] = anaRuns;
  const positions = await Promise.all([
    readRun(api, ana, second?.id ?? ''),
    readRun(api, ana, third?.id ?? ''),
    readRun(api, bia, biaRun.id),
  ]);
  const own = positions.map((view) => view.queuePosition?.own);
  assertCondition(own.join() === '1,2,1', `posição entre as do próprio dono: ${own.join()}`);
  assertCondition(
    positions.every(
      (view) => view.queuePosition !== null && view.queuePosition.overall >= view.queuePosition.own,
    ),
    'a posição global é um número',
  );
  const foreign = await api.call({ subject: bia, path: `/v1/runs/${second?.id}` });
  assertCondition(foreign.status === 404, `a execução de Ana para Bia: ${foreign.status}`);
  const biaText = JSON.stringify(positions[2]);
  assertCondition(
    !biaText.includes(second?.id ?? '') && !biaText.includes(ana) && !biaText.includes('subject-'),
    'a resposta de Bia não carrega dado de Ana',
  );
  assertCondition(
    Object.keys(positions[2]?.queuePosition ?? {})
      .sort()
      .join() === 'overall,own',
    'queuePosition só tem os dois números',
  );
  const listed = dataOf<{ id: string }[]>(await api.call({ subject: bia, path: '/v1/runs' }), 200);
  assertCondition(listed.length === 1 && listed[0]?.id === biaRun.id, 'a lista de Bia é só dela');
  const health = await api.call({
    subject: 'subject-queue-api-admin',
    claims: ADMIN_CLAIMS,
    path: '/v1/admin/health',
  });
  const summary = dataOf<{
    runs: { queued: number; running: number; byKind: Record<string, unknown> };
  }>(health, 200).runs;
  assertCondition(
    summary.queued >= 3 && summary.running >= 1,
    `resumo agregado: ${JSON.stringify(summary)}`,
  );
  assertCondition(
    !health.text.includes('subject-') && !health.text.includes(biaRun.id),
    'o resumo da saúde não leva usuário nem execução',
  );
  const stopped = await api.call({
    subject: ana,
    method: 'POST',
    path: `/v1/runs/${third?.id}/stop`,
  });
  assertCondition(stopped.status === 200, `parar a queued: ${stopped.status}`);
  const afterStop = await readRun(api, ana, third?.id ?? '');
  assertCondition(
    afterStop.status === 'cancelled' && afterStop.queuePosition === null,
    'cancelar remove da fila',
  );
  reportLine(
    `(vi) isolamento: queuePosition {own,overall} só com números (${own.join('/')}), a execução de Ana é 404 para Bia, a lista de Bia é só dela, a saúde do admin traz só contagens (queued ${summary.queued}, running ${summary.running}) e cancelar uma queued a tira da fila`,
  );
}

// (vi) Pela API de verdade: tetos (429/409), posição na fila sem vazar outro usuário e saúde agregada.
export async function checkIsolationOverHttp(context: QueueTestContext): Promise<void> {
  Bun.env['RUN_GLOBAL_CONCURRENCY'] = '1';
  Bun.env['RUN_QUEUE_PER_USER_LIMIT'] = String(QUEUE_LIMIT);
  const api = await createApiRunsContext(context.databaseUrl);
  try {
    await checkPositionsAndHealth(api, context);
    await checkQueueLimits(api, context);
  } finally {
    await api.stop();
  }
}
