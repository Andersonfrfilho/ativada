// Copyright (c) 2026 Ada Technology. All rights reserved.
import { sql } from 'drizzle-orm';

import type { DatabaseExecutor } from '../database-executor.js';
import type { OwnerScope } from '../ownership/owner-scope.js';
import { readSqlRows, toSegmentsJson, type SqlRow } from './run-projection-sql.js';
import type { ProjectionCounts, ProjectionReadParams } from './run-projections.types.js';

export type SummarizeProjectionsRequest = {
  readonly executor: DatabaseExecutor;
  readonly scope: OwnerScope;
  readonly runId: string;
  readonly params: ProjectionReadParams;
};

const EMPTY_STRENGTH = { hits: 0, misses: 0 } as const;
const EMPTY_COUNTS: ProjectionCounts = {
  noSide: 0,
  pending: 0,
  hits: 0,
  misses: 0,
  ties: 0,
  upMoves: 0,
  banded: 0,
  inside: 0,
  byStrength: { weak: EMPTY_STRENGTH, strong: EMPTY_STRENGTH, decided: EMPTY_STRENGTH },
};

// `count(*)::int` chega como número; texto também é aceito, e qualquer outra coisa é dado corrompido.
function readCount(row: SqlRow, key: string): number {
  const value = row[key];
  const count = typeof value === 'string' ? Number(value) : value;
  if (typeof count !== 'number' || !Number.isInteger(count)) {
    throw new Error('Contagem do resumo de previsões inválida.');
  }
  return count;
}

function toCounts(row: SqlRow): ProjectionCounts {
  const strength = (name: string): { hits: number; misses: number } => ({
    hits: readCount(row, `${name}_hits`),
    misses: readCount(row, `${name}_misses`),
  });
  return {
    noSide: readCount(row, 'no_side'),
    pending: readCount(row, 'pending'),
    hits: readCount(row, 'hits'),
    misses: readCount(row, 'misses'),
    ties: readCount(row, 'ties'),
    upMoves: readCount(row, 'up_moves'),
    banded: readCount(row, 'banded'),
    inside: readCount(row, 'inside'),
    byStrength: {
      weak: strength('weak'),
      strong: strength('strong'),
      decided: strength('decided'),
    },
  };
}

// O veredito de cada previsão e as contagens (P6): comparação exata em `numeric`; a faixa de ±ATR com a borda de baixo para baixo
// e a de cima para cima a 8 casas (nunca encolhe).
const JUDGED_COUNTS = sql`
  judged AS (
    SELECT score, next_close IS NULL AS is_open,
      CASE WHEN score = 0 OR next_close IS NULL THEN NULL
           ELSE sign(score) * sign(next_close - base_close) END AS outcome,
      next_close > base_close AS went_up,
      CASE WHEN abs(score) * 2 <= abs(CASE WHEN score > 0 THEN buy ELSE sell END) THEN 'weak'
           WHEN abs(score) < abs(CASE WHEN score > 0 THEN buy ELSE sell END) THEN 'strong'
           ELSE 'decided' END AS strength,
      CASE WHEN score = 0 OR atr IS NULL OR next_close IS NULL THEN NULL
           ELSE next_close >= floor((base_close - atr) * 100000000) / 100000000
            AND next_close <= ceil((base_close + atr) * 100000000) / 100000000 END AS is_inside
    FROM resolved
  )
  SELECT
    count(*) FILTER (WHERE score = 0)::int AS no_side,
    count(*) FILTER (WHERE score <> 0 AND is_open)::int AS pending,
    count(*) FILTER (WHERE outcome = 1)::int AS hits,
    count(*) FILTER (WHERE outcome = -1)::int AS misses,
    count(*) FILTER (WHERE outcome = 0)::int AS ties,
    count(*) FILTER (WHERE outcome <> 0 AND went_up)::int AS up_moves,
    count(is_inside)::int AS banded,
    count(*) FILTER (WHERE is_inside)::int AS inside,
    count(*) FILTER (WHERE outcome = 1 AND strength = 'weak')::int AS weak_hits,
    count(*) FILTER (WHERE outcome = -1 AND strength = 'weak')::int AS weak_misses,
    count(*) FILTER (WHERE outcome = 1 AND strength = 'strong')::int AS strong_hits,
    count(*) FILTER (WHERE outcome = -1 AND strength = 'strong')::int AS strong_misses,
    count(*) FILTER (WHERE outcome = 1 AND strength = 'decided')::int AS decided_hits,
    count(*) FILTER (WHERE outcome = -1 AND strength = 'decided')::int AS decided_misses
  FROM judged`;

// O resumo de acertos da execução INTEIRA em UMA consulta (ADR 0002, spec 009, P6): `LEAD` sobre a faixa de velas (a vela
// seguinte só vale se abrir exatamente uma duração depois e antes do fim da faixa), junção com os `signals` do dono e
// contagens com `FILTER`, tudo em `numeric` (comparação exata). A faixa de ±ATR sai em SQL com a borda de baixo para baixo e a
// de cima para cima a 8 casas. Nunca um laço por vela no Node.
export async function summarizeProjections(
  request: SummarizeProjectionsRequest,
): Promise<ProjectionCounts> {
  const { executor, scope, runId, params } = request;
  if (params.segments.length === 0) return EMPTY_COUNTS;
  const { market } = params;
  const segments = toSegmentsJson(params.segments);
  const rows: unknown = await executor.execute(sql`
    WITH segments AS (
      SELECT * FROM jsonb_to_recordset(${segments}::text::jsonb)
        AS w(start_time bigint, end_time bigint, buy numeric, sell numeric)
    ), series AS (
      SELECT open_time, close, lead(open_time) OVER ordered AS next_open, lead(close) OVER ordered AS next_close
      FROM candles
      WHERE exchange = ${market.exchange} AND symbol = ${market.symbol} AND timeframe = ${market.timeframe}
        AND open_time >= (SELECT min(start_time) FROM segments) AND open_time < ${params.rangeEnd}::bigint
      WINDOW ordered AS (ORDER BY open_time)
    ), resolved AS (
      SELECT s.score, series.close AS base_close, series.next_close,
        (s.indicators->>'risk:atr')::numeric AS atr, w.buy, w.sell
      FROM segments w
      JOIN signals s ON s.user_id = ${scope.ownerUserId} AND s.run_id = ${runId}
        AND s.candle_time >= w.start_time AND s.candle_time < w.end_time
      LEFT JOIN series ON series.open_time = s.candle_time
        AND series.next_open = s.candle_time + ${params.durationMilliseconds}::bigint
    ), ${JUDGED_COUNTS}`);
  const [row] = readSqlRows(rows);
  if (row === undefined)
    throw new Error('O resumo de previsões não devolveu a linha de contagens.');
  return toCounts(row);
}
