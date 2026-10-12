// Copyright (c) 2026 Ada Technology. All rights reserved.
import { CSV_CELL_KIND, formatCsvCell, formatCsvLine, type CsvCellKind } from './csv-format.js';

// Uma coluna do CSV: o cabeçalho é fixo e estável, e só entra o que a lista escolhe — nunca `user_id` nem hash.
export type CsvColumn<TRow> = {
  readonly header: string;
  readonly kind: CsvCellKind;
  readonly read: (row: TRow) => unknown;
};

export const textColumn = <TRow>(
  header: string,
  read: (row: TRow) => unknown,
): CsvColumn<TRow> => ({
  header,
  kind: CSV_CELL_KIND.TEXT,
  read,
});

export const decimalColumn = <TRow>(
  header: string,
  read: (row: TRow) => unknown,
): CsvColumn<TRow> => ({ header, kind: CSV_CELL_KIND.DECIMAL, read });

export const numberColumn = <TRow>(
  header: string,
  read: (row: TRow) => unknown,
): CsvColumn<TRow> => ({ header, kind: CSV_CELL_KIND.NUMBER, read });

export const jsonColumn = <TRow>(
  header: string,
  read: (row: TRow) => unknown,
): CsvColumn<TRow> => ({
  header,
  kind: CSV_CELL_KIND.JSON,
  read,
});

export function formatHeaderLine<TRow>(columns: readonly CsvColumn<TRow>[]): string {
  return formatCsvLine(columns.map((column) => column.header));
}

export function formatRowLine<TRow>(columns: readonly CsvColumn<TRow>[], row: TRow): string {
  return formatCsvLine(columns.map((column) => formatCsvCell(column.read(row), column.kind)));
}
