// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { OwnerScope } from '@ativada/database';

import {
  CSV_FILE_EXTENSION,
  CSV_MAX_DURATION_MILLISECONDS,
  CSV_MAX_ROWS,
  type ExportedCsvTable,
} from './csv-tables.constant.js';
import { createCsvSources, type CsvSourceDependencies } from './csv-source.js';
import { createCsvStream, type CsvStreamLimits } from './csv-stream.js';
import { RunNotFoundError } from './run.error.js';

export type RunCsvExport = {
  readonly fileName: string;
  readonly body: ReadableStream<Uint8Array>;
};

export type ExportRunCsvUseCase = (
  scope: OwnerScope,
  runId: string,
  table: ExportedCsvTable,
) => Promise<RunCsvExport>;

export type ExportRunCsvDependencies = {
  readonly results: CsvSourceDependencies;
  readonly now: () => number;
  readonly limits?: Partial<Pick<CsvStreamLimits, 'maxRows' | 'maxDurationMilliseconds'>>;
};

export function createExportRunCsvUseCase(
  dependencies: ExportRunCsvDependencies,
): ExportRunCsvUseCase {
  const sources = createCsvSources(dependencies.results);
  return async (scope, runId, table) => {
    // A primeira página é lida aqui: execução inexistente ou de outro dono é o 404 de sempre, antes do corpo.
    const opened = await sources[table](scope, runId);
    if (opened === undefined) throw new RunNotFoundError();
    return {
      fileName: `run-${runId}-${table}.${CSV_FILE_EXTENSION}`,
      body: createCsvStream(opened, {
        maxRows: dependencies.limits?.maxRows ?? CSV_MAX_ROWS,
        maxDurationMilliseconds:
          dependencies.limits?.maxDurationMilliseconds ?? CSV_MAX_DURATION_MILLISECONDS,
        now: dependencies.now,
      }),
    };
  };
}
