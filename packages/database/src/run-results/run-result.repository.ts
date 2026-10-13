// Copyright (c) 2026 Ada Technology. All rights reserved.
import { readOpenDatabase, type DatabaseHandle } from '../database-handle.js';
import type { DatabaseExecutor } from '../database-executor.js';
import type { OwnerScope } from '../ownership/owner-scope.js';
import { isOwnedRun } from '../runs/run-ownership.js';
import {
  writeCommands,
  writeEquityPoints,
  writeFills,
  writeSignals,
  writeWindows,
} from './run-result-append.js';
import { listEquityPoints, listFills, listOrders, listSignals } from './run-result-list.js';
import { listRunLog } from './run-log-list.js';
import { listFillsOfPositions } from './run-fill-list.js';
import { countFillsInRange, listFillClusters, listFillMarkers } from './run-fill-markers.js';
import { listPriceColumns } from './run-price-columns.js';
import { listPositions } from './run-position-list.js';
import { listSurvivalPoints } from './run-survival-points.js';
import { listWindows } from './run-window-list.js';
import { writeOrders, writePositions } from './run-result-upsert.js';
import type { WriteRequest } from './run-result-write.types.js';
import type {
  AppendResult,
  FillInput,
  ListResultsParams,
  ResultPage,
  RunResultRepository,
  SurvivalPointInput,
} from './run-result.types.js';

type Database = ReturnType<typeof readOpenDatabase>['database'];

// Uma transação por lote: confere o dono da execução e grava todos os blocos, ou nenhum.
function appender<TInput>(
  database: Database,
  write: (request: WriteRequest<TInput>) => Promise<number>,
): (
  scope: OwnerScope,
  runId: string,
  rows: readonly TInput[],
) => Promise<AppendResult | undefined> {
  return (scope, runId, rows) =>
    database.transaction(async (transaction) => {
      if (!(await isOwnedRun(transaction, scope, runId))) return undefined;
      const written = await write({
        executor: transaction,
        ownerUserId: scope.ownerUserId,
        runId,
        rows,
      });
      return { written };
    });
}

type ListRequest<TCursor> = {
  readonly executor: DatabaseExecutor;
  readonly scope: OwnerScope;
  readonly runId: string;
  readonly params: ListResultsParams<TCursor>;
};

function lister<TItem, TCursor, TParams extends ListResultsParams<TCursor>>(
  database: Database,
  list: (
    request: Omit<ListRequest<TCursor>, 'params'> & { readonly params: TParams },
  ) => Promise<ResultPage<TItem, TCursor>>,
): (
  scope: OwnerScope,
  runId: string,
  params: TParams,
) => Promise<ResultPage<TItem, TCursor> | undefined> {
  return async (scope, runId, params) => {
    if (!(await isOwnedRun(database, scope, runId))) return undefined;
    return list({ executor: database, scope, runId, params });
  };
}

type ChartReaders = Pick<
  RunResultRepository,
  'listPriceColumns' | 'listFillMarkers' | 'countFillsInRange' | 'listFillClusters'
>;

// As leituras do gráfico: cada uma confere o dono da execução antes de ler.
function createChartReaders(database: Database): ChartReaders {
  return {
    listPriceColumns: async (scope, runId, params) =>
      (await isOwnedRun(database, scope, runId))
        ? listPriceColumns({ executor: database, params })
        : undefined,
    listFillMarkers: async (scope, runId, params) =>
      (await isOwnedRun(database, scope, runId))
        ? listFillMarkers({ executor: database, scope, runId, params })
        : undefined,
    countFillsInRange: async (scope, runId, range) =>
      (await isOwnedRun(database, scope, runId))
        ? countFillsInRange({ executor: database, scope, runId, params: range })
        : undefined,
    listFillClusters: async (scope, runId, params) =>
      (await isOwnedRun(database, scope, runId))
        ? listFillClusters({ executor: database, scope, runId, params })
        : undefined,
  };
}

export function createRunResultRepository(handle: DatabaseHandle): RunResultRepository {
  const { database } = readOpenDatabase(handle);
  return {
    appendSignals: appender(database, writeSignals),
    appendOrders: appender(database, writeOrders),
    appendFills: appender(database, writeFills),
    appendPositions: appender(database, writePositions),
    appendEquityPoints: appender(database, writeEquityPoints),
    appendCommands: appender(database, writeCommands),
    appendWindows: appender(database, writeWindows),
    listSignals: lister(database, listSignals),
    listOrders: lister(database, listOrders),
    listFills: lister(database, listFills),
    listPositions: lister(database, listPositions),
    listEquityPoints: lister(database, listEquityPoints),
    listWindows: lister(database, listWindows),
    listLog: lister(database, listRunLog),
    listFillsOfPositions: async (
      scope,
      runId,
      positionKeys,
    ): Promise<readonly FillInput[] | undefined> => {
      if (!(await isOwnedRun(database, scope, runId))) return undefined;
      return listFillsOfPositions({ executor: database, scope, runId, positionKeys });
    },
    ...createChartReaders(database),
    listSurvivalPoints: async (
      scope,
      runId,
      params,
    ): Promise<readonly SurvivalPointInput[] | undefined> => {
      if (!(await isOwnedRun(database, scope, runId))) return undefined;
      return listSurvivalPoints({ executor: database, scope, runId, params });
    },
  };
}
