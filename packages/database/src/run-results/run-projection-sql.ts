// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { ProjectionSegment } from './run-projections.types.js';

export type SqlRow = Readonly<Record<string, unknown>>;

// Os trechos de limiar viajam como UM parâmetro de texto (`jsonb_to_recordset`): nada de SQL montado por concatenação.
export function toSegmentsJson(segments: readonly ProjectionSegment[]): string {
  return JSON.stringify(
    segments.map((segment) => ({
      start_time: segment.startTime,
      end_time: segment.endTime,
      buy: segment.buy,
      sell: segment.sell,
    })),
  );
}

function isSqlRow(value: unknown): value is SqlRow {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// O driver devolve a lista de linhas como `unknown`; só objeto de colunas passa.
export function readSqlRows(result: unknown): readonly SqlRow[] {
  if (!Array.isArray(result)) return [];
  const candidates: readonly unknown[] = result;
  return candidates.filter(isSqlRow);
}
