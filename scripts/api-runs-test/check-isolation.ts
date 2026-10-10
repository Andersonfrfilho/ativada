// Copyright (c) 2026 Ada Technology. All rights reserved.
import { MISSING_ID, SUBJECT_A, SUBJECT_B, SYMBOL } from './api-runs-test.constant.js';
import {
  assertCondition,
  reportLine,
  type ApiResponse,
  type ApiRunsContext,
} from './api-runs-test-context.js';
import { loadClassicScoreboard } from '../../test/fixtures/strategy-engine/engine-scenarios.fixture.js';
import { dataOf } from './api-runs-helpers.js';
import type { BacktestFlowResult, SeriesWindow } from './check-backtest-flow.js';

type Attempt = {
  readonly name: string;
  readonly method: string;
  readonly path: (id: string) => string;
  readonly body?: (id: string) => unknown;
  readonly resource: 'strategy' | 'run' | 'version';
};

const RUN_SERIES = ['equity', 'trades', 'signals', 'orders', 'fills', 'windows'];

function buildAttempts(window: SeriesWindow): readonly Attempt[] {
  const create = (versionId: string): unknown => ({
    strategyVersionId: versionId,
    kind: 'backtest',
    symbol: SYMBOL,
    timeframe: '1h',
    periodStart: window.periodStart,
    periodEnd: window.periodEnd,
  });
  return [
    {
      name: 'ler estratégia',
      method: 'GET',
      path: (id) => `/v1/strategies/${id}`,
      resource: 'strategy',
    },
    {
      name: 'listar versões',
      method: 'GET',
      path: (id) => `/v1/strategies/${id}/versions`,
      resource: 'strategy',
    },
    {
      name: 'criar versão',
      method: 'POST',
      path: (id) => `/v1/strategies/${id}/versions`,
      body: () => ({ config: loadClassicScoreboard() }),
      resource: 'strategy',
    },
    {
      name: 'criar execução sobre a versão',
      method: 'POST',
      path: () => '/v1/runs',
      body: create,
      resource: 'version',
    },
    { name: 'ler execução', method: 'GET', path: (id) => `/v1/runs/${id}`, resource: 'run' },
    {
      name: 'parar execução',
      method: 'POST',
      path: (id) => `/v1/runs/${id}/stop`,
      resource: 'run',
    },
    {
      name: 'exportar CSV',
      method: 'GET',
      path: (id) => `/v1/runs/${id}/export.csv`,
      resource: 'run',
    },
    {
      name: 'exportar o registro CSV',
      method: 'GET',
      path: (id) => `/v1/runs/${id}/log.csv`,
      resource: 'run',
    },
    ...RUN_SERIES.map((series): Attempt => ({
      name: `série ${series}`,
      method: 'GET',
      path: (id) => `/v1/runs/${id}/${series}`,
      resource: 'run',
    })),
  ];
}

function idOf(attempt: Attempt, flow: BacktestFlowResult): string {
  if (attempt.resource === 'strategy') return flow.strategyId;
  if (attempt.resource === 'version') return flow.versionId;
  return flow.runId;
}

async function send(context: ApiRunsContext, attempt: Attempt, id: string): Promise<ApiResponse> {
  return context.call({
    subject: SUBJECT_B,
    method: attempt.method,
    path: attempt.path(id),
    ...(attempt.body === undefined ? {} : { body: attempt.body(id) }),
  });
}

// Recurso de A pedido por B e UUID inexistente têm de ser a MESMA resposta: status, corpo inteiro e tamanho.
async function checkIndistinguishable(
  context: ApiRunsContext,
  attempt: Attempt,
  flow: BacktestFlowResult,
): Promise<void> {
  const foreign = await send(context, attempt, idOf(attempt, flow));
  const missing = await send(context, attempt, MISSING_ID);
  assertCondition(foreign.status === 404, `${attempt.name}: B recebeu ${foreign.status}`);
  assertCondition(
    foreign.status === missing.status &&
      foreign.text === missing.text &&
      new TextEncoder().encode(foreign.text).byteLength ===
        new TextEncoder().encode(missing.text).byteLength &&
      foreign.headers.get('content-type') === missing.headers.get('content-type'),
    `${attempt.name}: a resposta do recurso de A difere da do inexistente`,
  );
}

async function checkListsAndForgery(
  context: ApiRunsContext,
  flow: BacktestFlowResult,
  window: SeriesWindow,
): Promise<void> {
  const initialStrategies = dataOf<{ id: string; isExample: boolean }[]>(
    await context.call({ subject: SUBJECT_B, path: '/v1/strategies?limit=100' }),
    200,
  );
  const emptyRuns = dataOf<unknown[]>(
    await context.call({ subject: SUBJECT_B, path: '/v1/runs?limit=100' }),
    200,
  );
  const exampleOfB = initialStrategies[0];
  assertCondition(
    initialStrategies.length === 1 && exampleOfB?.isExample === true && emptyRuns.length === 0,
    'B começa só com a estratégia de exemplo dele e sem execuções',
  );
  const own = dataOf<{ strategy: { id: string }; version: { id: string } }>(
    await context.call({
      subject: SUBJECT_B,
      method: 'POST',
      path: '/v1/strategies',
      body: { name: 'De B', config: loadClassicScoreboard() },
    }),
    201,
  );
  const ownRun = dataOf<{ id: string }>(
    await context.call({
      subject: SUBJECT_B,
      method: 'POST',
      path: '/v1/runs',
      body: {
        strategyVersionId: own.version.id,
        kind: 'backtest',
        symbol: SYMBOL,
        timeframe: '1h',
        periodStart: window.periodStart,
        periodEnd: window.periodEnd,
      },
    }),
    202,
  );
  await context.call({ subject: SUBJECT_B, method: 'POST', path: `/v1/runs/${ownRun.id}/stop` });
  const idsOf = async (subject: string, path: string): Promise<string[]> =>
    dataOf<{ id: string }[]>(await context.call({ subject, path }), 200).map((row) => row.id);
  const strategiesOfB = await idsOf(SUBJECT_B, '/v1/strategies?limit=100');
  const runsOfB = await idsOf(SUBJECT_B, '/v1/runs?limit=100');
  assertCondition(
    strategiesOfB.length === 2 &&
      strategiesOfB.includes(own.strategy.id) &&
      strategiesOfB.includes(exampleOfB?.id ?? '') &&
      runsOfB.join() === ownRun.id,
    'B vê só o que é dele (a própria estratégia e o exemplo dele)',
  );
  const strategiesOfA = await idsOf(SUBJECT_A, '/v1/strategies?limit=100');
  const runsOfA = await idsOf(SUBJECT_A, '/v1/runs?limit=100');
  assertCondition(
    strategiesOfA.includes(flow.strategyId) &&
      !strategiesOfA.includes(own.strategy.id) &&
      !strategiesOfA.includes(exampleOfB?.id ?? '') &&
      runsOfA.includes(flow.runId) &&
      !runsOfA.includes(ownRun.id),
    'a listagem de A tem as de A e nenhuma de B',
  );
  const forged = await context.call({
    subject: SUBJECT_B,
    method: 'POST',
    path: '/v1/strategies',
    body: { name: 'Forjada', config: loadClassicScoreboard(), userId: 'qualquer' },
  });
  assertCondition(forged.status === 400, `userId no corpo: ${forged.status}`);
}

async function checkOwnerIntact(context: ApiRunsContext, flow: BacktestFlowResult): Promise<void> {
  const run = dataOf<{ status: string }>(
    await context.call({ subject: SUBJECT_A, path: `/v1/runs/${flow.runId}` }),
    200,
  );
  const versions = dataOf<unknown[]>(
    await context.call({ subject: SUBJECT_A, path: `/v1/strategies/${flow.strategyId}/versions` }),
    200,
  );
  assertCondition(
    run.status === 'completed' && versions.length === 2,
    'depois das tentativas de B, a execução e as versões de A seguem intactas',
  );
}

export async function checkIsolationOverHttp(
  context: ApiRunsContext,
  flow: BacktestFlowResult,
  window: SeriesWindow,
): Promise<void> {
  const attempts = buildAttempts(window);
  for (const attempt of attempts) await checkIndistinguishable(context, attempt, flow);
  await checkListsAndForgery(context, flow, window);
  await checkOwnerIntact(context, flow);
  reportLine(
    `ISOLAMENTO: B tenta ${attempts.length} operações sobre estratégia, versão e execução de A (ler, listar versões, criar versão, criar execução, parar, exportar CSV e as 6 séries): 404 com status, corpo e tamanho IDÊNTICOS ao de um id inexistente; as listagens de B e de A não se cruzam; userId no corpo é 400; os dados de A ficam intactos`,
  );
}
