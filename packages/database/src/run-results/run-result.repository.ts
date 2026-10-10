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
import {
  listEquityPoints,
  listFills,
  listOrders,
  listPositions,
  listSignals,
} from './run-result-list.js';
import { listRunLog } from './run-log-list.js';
import { listWindows } from './run-window-list.js';
import { writeOrders, writePositions } from './run-result-upsert.js';
import type { WriteRequest } from './run-result-write.types.js';
import type {
  AppendResult,
  ListResultsParams,
  ResultPage,
  RunResultRepository,
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

function lister<TItem, TCursor>(
  database: Database,
  list: (request: ListRequest<TCursor>) => Promise<ResultPage<TItem, TCursor>>,
): (
  scope: OwnerScope,
  runId: string,
  params: ListResultsParams<TCursor>,
) => Promise<ResultPage<TItem, TCursor> | undefined> {
  return async (scope, runId, params) => {
    if (!(await isOwnedRun(database, scope, runId))) return undefined;
    return list({ executor: database, scope, runId, params });
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
  };
}
