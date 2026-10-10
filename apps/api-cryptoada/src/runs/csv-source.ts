// Copyright (c) 2026 Ada Technology. All rights reserved.
import type {
  ListResultsParams,
  OwnerScope,
  ResultPage,
  RunResultRepository,
} from '@cryptoada/database';

import { formatHeaderLine, formatRowLine, type CsvColumn } from './csv-columns.js';
import { CSV_PAGE_SIZE, type ExportedCsvTable } from './csv-tables.constant.js';
import {
  EQUITY_COLUMNS,
  FILL_COLUMNS,
  LOG_COLUMNS,
  SIGNAL_COLUMNS,
  TRADE_COLUMNS,
  WINDOW_COLUMNS,
} from './csv-tables.js';
import { RunNotFoundError } from './run.error.js';

export type CsvPage = { readonly lines: readonly string[]; readonly isLast: boolean };

// Lê a próxima página do registro; a primeira já foi lida na abertura (para a execução inexistente virar 404 ANTES
// de qualquer byte do corpo).
export type CsvPageReader = () => Promise<CsvPage>;

export type OpenedCsvTable = { readonly header: string; readonly read: CsvPageReader };
export type OpenCsvTable = (
  scope: OwnerScope,
  runId: string,
) => Promise<OpenedCsvTable | undefined>;

type ListFunction<TRow, TCursor> = (
  scope: OwnerScope,
  runId: string,
  params: ListResultsParams<TCursor>,
) => Promise<ResultPage<TRow, TCursor> | undefined>;

function openTable<TRow, TCursor>(
  columns: readonly CsvColumn<TRow>[],
  list: ListFunction<TRow, TCursor>,
): OpenCsvTable {
  return async (scope, runId) => {
    const first = await list(scope, runId, { limit: CSV_PAGE_SIZE, after: undefined });
    if (first === undefined) return undefined;
    let current = first;
    let isFirstRead = true;
    const read: CsvPageReader = async () => {
      if (!isFirstRead) {
        const cursor = current.nextCursor;
        if (cursor === undefined) return { lines: [], isLast: true };
        const next = await list(scope, runId, { limit: CSV_PAGE_SIZE, after: cursor });
        if (next === undefined) throw new RunNotFoundError();
        current = next;
      }
      isFirstRead = false;
      return {
        lines: current.items.map((row) => formatRowLine(columns, row)),
        isLast: current.nextCursor === undefined,
      };
    };
    return { header: formatHeaderLine(columns), read };
  };
}

export type CsvSourceDependencies = Pick<
  RunResultRepository,
  'listPositions' | 'listSignals' | 'listFills' | 'listEquityPoints' | 'listWindows' | 'listLog'
>;

export function createCsvSources(
  results: CsvSourceDependencies,
): Readonly<Record<ExportedCsvTable, OpenCsvTable>> {
  return {
    trades: openTable(TRADE_COLUMNS, results.listPositions),
    signals: openTable(SIGNAL_COLUMNS, results.listSignals),
    fills: openTable(FILL_COLUMNS, results.listFills),
    equity: openTable(EQUITY_COLUMNS, results.listEquityPoints),
    windows: openTable(WINDOW_COLUMNS, results.listWindows),
    log: openTable(LOG_COLUMNS, results.listLog),
  };
}
