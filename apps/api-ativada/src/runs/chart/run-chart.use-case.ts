// Copyright (c) 2026 Ada Technology. All rights reserved.
import {
  RUN_KIND,
  type OwnerScope,
  type RunRecord,
  type RunRepository,
  type RunResultRepository,
  type TimeRange,
  type WalkForwardWindowInput,
} from '@ativada/database';

import { RunNotFoundError } from '../run.error.js';
import { CHART_COLUMNS, CHART_MARKER_LIMIT, CHART_WINDOW_READ_LIMIT } from '../runs.constant.js';
import { readChartDecisions, type ChartDecisionDependencies } from './chart-decisions.js';
import { toClusterViews, toMarkerView, type ChartView } from './chart-views.js';
import type { ChartQuery } from './run-chart.schema.js';
import { clipRange, resolveRunRange } from './run-chart-range.js';

export type RunChartDependencies = ChartDecisionDependencies & {
  readonly runs: Pick<RunRepository, 'findRun'>;
  readonly results: Pick<
    RunResultRepository,
    | 'listWindows'
    | 'listPriceColumns'
    | 'listFillMarkers'
    | 'countFillsInRange'
    | 'listFillClusters'
  >;
  // A corretora das velas (o backtest e o ao vivo leem a mesma série pública).
  readonly exchange: string;
};

export type RunChartUseCase = (
  scope: OwnerScope,
  runId: string,
  query: ChartQuery,
) => Promise<ChartView>;

const EMPTY_TOTALS = { buys: 0, sells: 0 } as const;

// Execução na fila (ou ao vivo antes da primeira vela): lista vazia, não erro.
function emptyChart(run: RunRecord): ChartView {
  return {
    symbol: run.symbol,
    timeframe: run.timeframe,
    from: run.periodStart,
    to: run.periodStart,
    runRange: { from: run.periodStart, to: run.periodStart },
    lastClosedCandleTime: run.lastCandleTime ?? null,
    columns: [],
    markers: [],
    clusters: null,
    totals: EMPTY_TOTALS,
    decisions: run.kind === RUN_KIND.LIVE_PAPER ? [] : null,
  };
}

async function readWindows(
  dependencies: RunChartDependencies,
  params: { readonly scope: OwnerScope; readonly run: RunRecord },
): Promise<readonly WalkForwardWindowInput[]> {
  if (params.run.kind !== RUN_KIND.WALK_FORWARD) return [];
  const page = await dependencies.results.listWindows(params.scope, params.run.id, {
    limit: CHART_WINDOW_READ_LIMIT,
    after: undefined,
  });
  if (page === undefined) throw new RunNotFoundError();
  return page.items;
}

type ChartRead = {
  readonly scope: OwnerScope;
  readonly run: RunRecord;
  readonly range: TimeRange;
  readonly runRange: TimeRange;
  readonly columns: number;
};

// Até `CHART_MARKER_LIMIT` preenchimentos, cada um vira marcador; acima disso, agrupamentos pelo mesmo balde do preço.
async function readFills(
  dependencies: RunChartDependencies,
  read: ChartRead,
  totals: { readonly buys: number; readonly sells: number },
): Promise<Pick<ChartView, 'markers' | 'clusters'>> {
  const { results } = dependencies;
  const { scope, run, range, columns } = read;
  if (totals.buys + totals.sells <= CHART_MARKER_LIMIT) {
    const markers = await results.listFillMarkers(scope, run.id, {
      range,
      limit: CHART_MARKER_LIMIT,
    });
    if (markers === undefined) throw new RunNotFoundError();
    return { markers: markers.map(toMarkerView), clusters: null };
  }
  const buckets = await results.listFillClusters(scope, run.id, { range, columns });
  if (buckets === undefined) throw new RunNotFoundError();
  return { markers: null, clusters: toClusterViews({ buckets, range, columns }) };
}

// As decisões são refinamento do gráfico: falhar ao lê-las não derruba o preço e as operações (a resposta traz `null`).
function readDecisionsApart(
  dependencies: RunChartDependencies,
  read: ChartRead,
): Promise<ChartView['decisions']> {
  const { scope, run, range } = read;
  return readChartDecisions(dependencies, { scope, run, range }).catch(() => null);
}

async function buildChart(dependencies: RunChartDependencies, read: ChartRead): Promise<ChartView> {
  const { results, exchange } = dependencies;
  const { scope, run, range, runRange, columns } = read;
  const [totals, priceColumns, decisions] = await Promise.all([
    results.countFillsInRange(scope, run.id, range),
    results.listPriceColumns(scope, run.id, {
      exchange,
      symbol: run.symbol,
      timeframe: run.timeframe,
      range,
      columns,
    }),
    readDecisionsApart(dependencies, read),
  ]);
  if (totals === undefined || priceColumns === undefined) throw new RunNotFoundError();
  return {
    symbol: run.symbol,
    timeframe: run.timeframe,
    from: range.from,
    to: range.to,
    runRange: { from: runRange.from, to: runRange.to },
    lastClosedCandleTime: run.lastCandleTime ?? null,
    columns: priceColumns,
    ...(await readFills(dependencies, read, totals)),
    totals,
    decisions,
  };
}

// O gráfico de preço e operações da execução (spec 005): só do dono; a faixa pedida é recortada à da execução.
export function createRunChartUseCase(dependencies: RunChartDependencies): RunChartUseCase {
  return async (scope, runId, query) => {
    const run = await dependencies.runs.findRun(scope, runId);
    if (run === undefined) throw new RunNotFoundError();
    const windows = await readWindows(dependencies, { scope, run });
    const runRange = resolveRunRange(run, windows);
    if (runRange === undefined) return emptyChart(run);
    return buildChart(dependencies, {
      scope,
      run,
      range: clipRange(runRange, query),
      runRange,
      columns: query.columns ?? CHART_COLUMNS.DEFAULT,
    });
  };
}
