// Copyright (c) 2026 Ada Technology. All rights reserved.
export const CSV_TABLE_NAMES = ['trades', 'signals', 'fills', 'equity', 'windows'] as const;
export type CsvTableName = (typeof CSV_TABLE_NAMES)[number];

export const DEFAULT_CSV_TABLE: CsvTableName = 'trades';

// Linhas lidas do banco por página no fluxo (o repositório limita a 5.000).
export const CSV_PAGE_SIZE = 1_000;
// Tetos do arquivo: passou de um deles, o fluxo é ABORTADO (nunca um arquivo cortado que parece completo).
export const CSV_MAX_ROWS = 1_000_000;
export const CSV_MAX_DURATION_MILLISECONDS = 60_000;

export const CSV_CONTENT_TYPE = 'text/csv; charset=utf-8';
export const CSV_LINE_BREAK = '\r\n';
export const CSV_FILE_EXTENSION = 'csv';
export const CSV_TABLE_FIELD = 'table';
