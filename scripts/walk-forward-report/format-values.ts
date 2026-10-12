// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { DecimalText } from './report.types.js';

const NOT_AVAILABLE = 'n/d';
const PERCENT_DIGITS = 2;

function localize(value: number, digits: number): string {
  return value.toLocaleString('pt-BR', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

export function formatPercent(text: DecimalText, digits: number = PERCENT_DIGITS): string {
  if (text === null) return NOT_AVAILABLE;
  return `${localize(Number(text) * 100, digits)}%`;
}

export function formatNumber(text: DecimalText, digits: number): string {
  return text === null ? NOT_AVAILABLE : localize(Number(text), digits);
}

export function formatMoney(text: string): string {
  return `US$ ${localize(Number(text), 2)}`;
}

export function formatDate(milliseconds: number): string {
  return new Date(milliseconds).toISOString().slice(0, 10);
}

export function formatAssignment(assignment: Readonly<Record<string, string | number>>): string {
  const labels = Object.entries(assignment).map(
    ([path, value]) => `${path.split('.').at(-1) ?? path}=${String(value)}`,
  );
  return labels.length === 0 ? '—' : labels.join(', ');
}

export function markdownTable(
  headers: readonly string[],
  rows: readonly (readonly string[])[],
): string[] {
  const line = (cells: readonly string[]): string => `| ${cells.join(' | ')} |`;
  return [line(headers), line(headers.map(() => '---')), ...rows.map(line), ''];
}
