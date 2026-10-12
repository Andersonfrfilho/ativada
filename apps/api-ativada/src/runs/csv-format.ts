// Copyright (c) 2026 Ada Technology. All rights reserved.
import { CSV_LINE_BREAK } from './csv-tables.constant.js';

// Célula iniciada por qualquer destes vira fórmula na planilha (OWASP, "CSV Injection"): leva um apóstrofo na frente.
const FORMULA_PREFIXES: readonly string[] = ['=', '+', '-', '@', '\t', '\r'];
const FORMULA_NEUTRALIZER = "'";
const DECIMAL_TEXT_PATTERN = /^-?\d+(\.\d+)?$/;
const MUST_QUOTE_PATTERN = /[",\r\n]/;

export const CSV_CELL_KIND = {
  TEXT: 'text',
  DECIMAL: 'decimal',
  NUMBER: 'number',
  JSON: 'json',
} as const;
export type CsvCellKind = (typeof CSV_CELL_KIND)[keyof typeof CSV_CELL_KIND];

export function neutralizeFormula(text: string): string {
  return FORMULA_PREFIXES.some((prefix) => text.startsWith(prefix))
    ? `${FORMULA_NEUTRALIZER}${text}`
    : text;
}

function stringifyScalar(value: unknown): string {
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
    return String(value);
  }
  return JSON.stringify(value);
}

// Decimal exato do banco (`-12.5`) e número inteiro nunca são fórmula: seguem como estão, para a planilha ler um número.
// Todo o resto é texto e passa pelo neutralizador. JSON sai compacto.
function toCellText(value: unknown, kind: CsvCellKind): string {
  if (value === undefined || value === null) return '';
  if (kind === CSV_CELL_KIND.JSON) return JSON.stringify(value);
  const text = typeof value === 'string' ? value : stringifyScalar(value);
  if (kind === CSV_CELL_KIND.NUMBER && typeof value === 'number') return text;
  if (kind === CSV_CELL_KIND.DECIMAL && DECIMAL_TEXT_PATTERN.test(text)) return text;
  return neutralizeFormula(text);
}

function quote(text: string): string {
  return MUST_QUOTE_PATTERN.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function formatCsvCell(value: unknown, kind: CsvCellKind): string {
  return quote(toCellText(value, kind));
}

export function formatCsvLine(cells: readonly string[]): string {
  return `${cells.join(',')}${CSV_LINE_BREAK}`;
}
