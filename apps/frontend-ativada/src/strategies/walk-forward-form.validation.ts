// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { FormProblem } from '../forms/ProblemList.component.js';
import type { Leaf } from './config-leaves.js';

export type GridRow = { readonly key: string; readonly values: string };

export type WalkForwardFormValues = {
  readonly versionId: string;
  readonly symbol: string;
  readonly timeframe: string;
  readonly start: string;
  readonly end: string;
  readonly rows: readonly GridRow[];
};

export const MAX_COMBINATIONS = 200;
export const MAX_GRID_ROWS = 3;
export const MAX_VALUES_PER_ROW = 20;
const MILLISECONDS_PER_DAY = 86_400_000;
const DEFAULT_WINDOW_DAYS = 730;
const DECIMAL_PATTERN = /^-?\d+(\.\d+)?$/;
const INTEGER_PATTERN = /^-?\d+$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const VALUE_SEPARATOR = /[,;\s]+/;

export function emptyRow(): GridRow {
  return { key: '', values: '' };
}

export function defaultWalkForwardValues(now: number, symbol: string): WalkForwardFormValues {
  const end = Math.floor(now / MILLISECONDS_PER_DAY) * MILLISECONDS_PER_DAY - MILLISECONDS_PER_DAY;
  return {
    versionId: '',
    symbol,
    timeframe: '1d',
    start: new Date(end - DEFAULT_WINDOW_DAYS * MILLISECONDS_PER_DAY).toISOString().slice(0, 10),
    end: new Date(end).toISOString().slice(0, 10),
    rows: [emptyRow()],
  };
}

function splitValues(text: string): string[] {
  return text
    .split(VALUE_SEPARATOR)
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
}

export function countCombinations(rows: readonly GridRow[]): number {
  return rows.reduce((total, row) => total * Math.max(splitValues(row.values).length, 1), 1);
}

function toUtcMilliseconds(dateText: string): number {
  return Date.parse(`${dateText}T00:00:00.000Z`);
}

function rowProblem(row: GridRow, index: number, leaves: readonly Leaf[]): FormProblem | undefined {
  const field = `Parâmetro ${index + 1}`;
  const leaf = leaves.find((candidate) => candidate.key === row.key);
  const values = splitValues(row.values);
  if (leaf === undefined) return { field, message: 'escolha o parâmetro.' };
  if (values.length === 0) return { field, message: 'informe ao menos um valor.' };
  if (values.length > MAX_VALUES_PER_ROW || new Set(values).size !== values.length) {
    return { field, message: `use de 1 a ${MAX_VALUES_PER_ROW} valores, sem repetir.` };
  }
  const pattern = leaf.kind === 'number' ? INTEGER_PATTERN : DECIMAL_PATTERN;
  if (!values.every((value) => pattern.test(value))) {
    return {
      field,
      message:
        leaf.kind === 'number' ? 'use números inteiros.' : 'use números decimais (ex.: 1.5).',
    };
  }
  return undefined;
}

export function validateWalkForwardForm(
  values: WalkForwardFormValues,
  leaves: readonly Leaf[],
): FormProblem[] {
  const problems: (FormProblem | undefined)[] = [];
  if (values.versionId === '')
    problems.push({ field: 'Versão', message: 'escolha uma estratégia.' });
  const hasDates = DATE_PATTERN.test(values.start) && DATE_PATTERN.test(values.end);
  if (!hasDates) problems.push({ field: 'Início', message: 'informe as duas datas.' });
  else if (toUtcMilliseconds(values.end) <= toUtcMilliseconds(values.start)) {
    problems.push({ field: 'Fim', message: 'deve ser depois do início.' });
  }
  values.rows.forEach((row, index) => {
    const repeated = values.rows.findIndex((other) => other.key === row.key) !== index;
    problems.push(
      repeated
        ? { field: `Parâmetro ${index + 1}`, message: 'parâmetro repetido na grade.' }
        : rowProblem(row, index, leaves),
    );
  });
  const found = problems.filter((problem): problem is FormProblem => problem !== undefined);
  if (found.length === 0 && countCombinations(values.rows) > MAX_COMBINATIONS) {
    found.push({
      field: 'Grade',
      message: `no máximo ${MAX_COMBINATIONS} combinações (hoje: ${countCombinations(values.rows)}).`,
    });
  }
  return found;
}

export function buildWalkForwardRequest(
  values: WalkForwardFormValues,
  leaves: readonly Leaf[],
): Record<string, unknown> {
  return {
    strategyVersionId: values.versionId,
    kind: 'walk_forward',
    symbol: values.symbol,
    timeframe: values.timeframe,
    periodStart: toUtcMilliseconds(values.start),
    periodEnd: toUtcMilliseconds(values.end),
    grid: {
      parameters: values.rows.map((row) => {
        const isWhole = leaves.find((leaf) => leaf.key === row.key)?.kind === 'number';
        const list = splitValues(row.values);
        return { path: row.key, values: isWhole ? list.map(Number) : list };
      }),
    },
  };
}
