// Copyright (c) 2026 Ada Technology. All rights reserved.
import {
  RESULT_INSERT_MAXIMUM_PARAMETERS,
  RESULT_INSERT_MAXIMUM_ROWS,
} from './run-result.constant.js';

// Linhas por INSERT: até 5.000 (ADR 0002 §b) e nunca acima do teto de parâmetros do protocolo do Postgres.
export function chunkRows<TRow>(
  rows: readonly TRow[],
  columnCount: number,
): readonly (readonly TRow[])[] {
  const size = Math.max(
    1,
    Math.min(
      RESULT_INSERT_MAXIMUM_ROWS,
      Math.floor(RESULT_INSERT_MAXIMUM_PARAMETERS / columnCount),
    ),
  );
  const chunks: (readonly TRow[])[] = [];
  for (let start = 0; start < rows.length; start += size)
    chunks.push(rows.slice(start, start + size));
  return chunks;
}

function definedFields<TRow extends object>(row: TRow): Partial<TRow> {
  return Object.fromEntries(
    Object.entries(row).filter(([, value]) => value !== undefined),
  ) as Partial<TRow>;
}

type MonotonicRule<TRow> = {
  readonly keyOf: (row: TRow) => string;
  readonly rankOf: (row: TRow) => number;
};

// Eventos da mesma chave no mesmo lote: o status mais avançado vence (o primeiro, se empatarem) e os
// campos que só um evento anterior trouxe completam o resultado, como o upsert faria linha a linha.
export function mergeMonotonic<TRow extends object>(
  rows: readonly TRow[],
  rule: MonotonicRule<TRow>,
): readonly TRow[] {
  const merged = new Map<string, TRow>();
  for (const row of rows) {
    const current = merged.get(rule.keyOf(row));
    if (current === undefined) {
      merged.set(rule.keyOf(row), row);
      continue;
    }
    const advances = rule.rankOf(row) > rule.rankOf(current);
    const winner = advances ? row : current;
    const loser = advances ? current : row;
    merged.set(rule.keyOf(row), { ...definedFields(loser), ...definedFields(winner) } as TRow);
  }
  return [...merged.values()];
}
