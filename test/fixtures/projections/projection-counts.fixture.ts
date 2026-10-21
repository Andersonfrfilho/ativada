// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { ProjectionCounts } from '../../../packages/database/src/index.js';
import type { OracleStrength, OracleSummary } from './projection-summary-oracle.fixture.js';

function strengthCounts(
  summary: OracleSummary,
  name: OracleStrength,
): { readonly hits: number; readonly misses: number } {
  const { counted, hits } = summary.byStrength[name];
  return { hits, misses: counted - hits };
}

// As contagens que a consulta SQL do resumo devolve, na forma do repositório, a partir do resumo do oráculo.
export function toProjectionCounts(summary: OracleSummary): ProjectionCounts {
  return {
    noSide: summary.noSide,
    pending: summary.pending,
    hits: summary.hits,
    misses: summary.misses,
    ties: summary.ties,
    upMoves: summary.upMoves,
    banded: summary.banded,
    inside: summary.inside,
    byStrength: {
      weak: strengthCounts(summary, 'weak'),
      strong: strengthCounts(summary, 'strong'),
      decided: strengthCounts(summary, 'decided'),
    },
  };
}
