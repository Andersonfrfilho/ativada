// Copyright (c) 2026 Ada Technology. All rights reserved.
import {
  SCENARIO_GRID,
  SCENARIO_START,
  SHORT_STRATEGY,
} from '../../test/fixtures/walk-forward/walk-forward-scenarios.fixture.js';
import { SUBJECT_A, SYMBOL } from './api-runs-test.constant.js';
import {
  assertCondition,
  countRows,
  reportLine,
  type ApiResponse,
  type ApiRunsContext,
} from './api-runs-test-context.js';
import {
  dataOf,
  isFinished,
  readPages,
  splitCsv,
  waitForRun,
  type RunData,
} from './api-runs-helpers.js';
import { startHealthProbe } from './health-probe.js';
import type { SeriesWindow } from './check-backtest-flow.js';

const SCENARIO_END = Date.UTC(2024, 2, 1);
const WINDOWS = 4;
const COMBINATIONS_GRID = {
  parameters: [
    { path: 'rules.ema-9-21.fastPeriod', values: [7, 9, 11] },
    { path: 'rules.ema-9-21.slowPeriod', values: [18, 21, 24, 27] },
  ],
};

async function createVersion(context: ApiRunsContext, config: unknown): Promise<string> {
  const created = dataOf<{ version: { id: string } }>(
    await context.call({
      subject: SUBJECT_A,
      method: 'POST',
      path: '/v1/strategies',
      body: { name: 'Walk-forward', config },
    }),
    201,
  );
  return created.version.id;
}

async function postRun(
  context: ApiRunsContext,
  body: Record<string, unknown>,
): Promise<ApiResponse> {
  return context.call({ subject: SUBJECT_A, method: 'POST', path: '/v1/runs', body });
}

async function checkRejections(context: ApiRunsContext, versionId: string): Promise<void> {
  const base = {
    strategyVersionId: versionId,
    kind: 'walk_forward',
    symbol: SYMBOL,
    timeframe: '1d',
  };
  const tooLarge = await postRun(context, {
    ...base,
    periodStart: SCENARIO_START,
    periodEnd: SCENARIO_END,
    grid: {
      parameters: [
        {
          path: 'rules.ema-cross.fastPeriod',
          values: Array.from({ length: 20 }, (_u, i) => 2 + i),
        },
        {
          path: 'rules.ema-cross.slowPeriod',
          values: Array.from({ length: 20 }, (_u, i) => 22 + i),
        },
      ],
    },
  });
  const tooShort = await postRun(context, {
    ...base,
    periodStart: SCENARIO_START,
    periodEnd: Date.UTC(2023, 8, 1),
    grid: SCENARIO_GRID,
  });
  // A simulação ao vivo começa no candle corrente e não tem fim: período no corpo é recusado.
  const liveWithPeriod = await postRun(context, {
    ...base,
    kind: 'live_paper',
    periodStart: SCENARIO_START,
    periodEnd: SCENARIO_END,
  });
  const codes = [tooLarge, tooShort, liveWithPeriod].map(
    (r) => (r.json as { error: { code: string } }).error.code,
  );
  assertCondition(
    codes.join() === 'GRID_TOO_LARGE,PERIOD_TOO_SHORT,REQUEST_VALIDATION_FAILED',
    `recusas antes de aceitar: ${codes.join()}`,
  );
  assertCondition(
    [tooLarge.status, tooShort.status, liveWithPeriod.status].join() === '400,400,400',
    'status das recusas',
  );
  const stored: unknown =
    await context.client`SELECT count(*)::int AS total FROM runs WHERE kind = 'walk_forward'`;
  assertCondition(
    (stored as { total: number }[])[0]?.total === 0,
    'nenhuma execução criada pelas recusas',
  );
  reportLine(
    'walk-forward recusado ANTES de aceitar (grade grande 400, período curto 400, live_paper com período 400) sem criar execução',
  );
}

async function checkSmallWalkForward(context: ApiRunsContext, versionId: string): Promise<void> {
  const accepted = dataOf<RunData>(
    await postRun(context, {
      strategyVersionId: versionId,
      kind: 'walk_forward',
      symbol: SYMBOL,
      timeframe: '1d',
      periodStart: SCENARIO_START,
      periodEnd: SCENARIO_END,
      grid: SCENARIO_GRID,
      windows: { minTradesPerWindow: 2 },
    }),
    202,
  );
  const stored: unknown = await context.client`SELECT request FROM runs WHERE id = ${accepted.id}`;
  const request = (stored as { request: { grid: unknown; minTradesPerWindow: number } }[])[0]
    ?.request;
  assertCondition(
    JSON.stringify(request?.grid) === JSON.stringify(SCENARIO_GRID) &&
      request?.minTradesPerWindow === 2,
    'o pedido (grade e janelas) foi gravado na linha da execução',
  );
  const probe = startHealthProbe(context, 'o walk-forward disparado pela API');
  const done = await waitForRun(context, {
    subject: SUBJECT_A,
    runId: accepted.id,
    until: isFinished,
    label: 'walk-forward',
  });
  await probe.stop();
  assertCondition(
    done.status === 'completed',
    `walk-forward terminou ${done.status} ${String(done.errorCode)}`,
  );
  assertCondition(
    done.overfitting !== null && 'isAlert' in done.overfitting,
    'GET traz o alerta de overfitting',
  );
  const windows = await readPages(context, {
    subject: SUBJECT_A,
    path: `/v1/runs/${accepted.id}/windows`,
    maxPages: 2,
  });
  assertCondition(
    windows.rows.length === WINDOWS && windows.isComplete,
    `janelas: ${windows.rows.length}`,
  );
  const csv = await context.call({
    subject: SUBJECT_A,
    path: `/v1/runs/${accepted.id}/export.csv?table=windows`,
  });
  assertCondition(
    csv.status === 200 && splitCsv(csv.text).lines.length === WINDOWS,
    'CSV das janelas',
  );
  assertCondition(
    (await countRows(context.client, 'walk_forward_windows', accepted.id)) === WINDOWS,
    'janelas no banco',
  );
  reportLine(
    `walk-forward pequeno (12 combinações, ${WINDOWS} janelas) criado e acompanhado pela API: alerta de overfitting presente, /windows e CSV batem com o banco`,
  );
}

async function stopWhenRunning(
  context: ApiRunsContext,
  runId: string,
  label: string,
  isInProgress: (run: RunData) => boolean,
): Promise<void> {
  // Consulta rápida (100 ms): o backtest de 2 anos dura ~3 s e a parada precisa pegá-lo em andamento.
  const running = await waitForRun(context, {
    subject: SUBJECT_A,
    runId,
    until: (run) => isInProgress(run) || isFinished(run),
    label,
    pauseMilliseconds: 100,
  });
  assertCondition(
    running.status === 'running',
    `${label}: terminou antes de ser parado (${running.status})`,
  );
  const stopped = dataOf<{ status: string }>(
    await context.call({ subject: SUBJECT_A, method: 'POST', path: `/v1/runs/${runId}/stop` }),
    200,
  );
  assertCondition(stopped.status === 'cancelled', `parada: ${stopped.status}`);
  const again = await context.call({
    subject: SUBJECT_A,
    method: 'POST',
    path: `/v1/runs/${runId}/stop`,
  });
  assertCondition(again.status === 200, 'parar de novo é idempotente');
  await Bun.sleep(2_000);
  const final = dataOf<RunData>(
    await context.call({ subject: SUBJECT_A, path: `/v1/runs/${runId}` }),
    200,
  );
  assertCondition(
    final.status === 'cancelled' && final.metrics === null,
    `${label}: ficou ${final.status}`,
  );
  reportLine(
    `${label}: parada com a execução em andamento (progresso ${running.progress}) → cancelled, idempotente, sem métricas`,
  );
}

export async function checkWalkForwardAndStops(
  context: ApiRunsContext,
  params: { readonly classicVersionId: string; readonly window: SeriesWindow },
): Promise<void> {
  const shortVersion = await createVersion(context, SHORT_STRATEGY);
  await checkRejections(context, shortVersion);
  await checkSmallWalkForward(context, shortVersion);
  const heavy = dataOf<RunData>(
    await postRun(context, {
      strategyVersionId: params.classicVersionId,
      kind: 'walk_forward',
      symbol: SYMBOL,
      timeframe: '1h',
      periodStart: params.window.periodStart,
      periodEnd: params.window.periodEnd,
      grid: COMBINATIONS_GRID,
    }),
    202,
  );
  await stopWhenRunning(context, heavy.id, 'walk-forward de 2 anos', (run) => run.progress >= 5);
  const backtest = dataOf<RunData>(
    await postRun(context, {
      strategyVersionId: params.classicVersionId,
      kind: 'backtest',
      symbol: SYMBOL,
      timeframe: '1h',
      periodStart: params.window.periodStart,
      periodEnd: params.window.periodEnd,
    }),
    202,
  );
  await stopWhenRunning(
    context,
    backtest.id,
    'backtest de 2 anos',
    (run) => run.status === 'running',
  );
}
