// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { ProjectionCounts } from '@ativada/database';
import { judgeAgainstCoinFlip, type CoinFlipVerdict } from '@ativada/statistics';

import { describeSummary, describeVerdict } from './projection-messages.js';
import { computeRate } from './projection-rule.js';
import { PROJECTION_STRENGTH, type ProjectionStrength } from './projections.constant.js';

export type ProjectionSummaryView = {
  readonly counted: number;
  readonly hits: number;
  readonly misses: number;
  readonly ties: number;
  readonly noSide: number;
  readonly pending: number;
  readonly upMoves: number;
  readonly banded: number;
  readonly inside: number;
  readonly hitRate: string | null;
  readonly upRate: string | null;
  readonly insideRate: string | null;
  readonly byStrength: readonly {
    readonly strength: ProjectionStrength;
    readonly counted: number;
    readonly hits: number;
    readonly hitRate: string | null;
  }[];
  readonly wilson: { readonly lower: string; readonly upper: string } | null;
  readonly verdict: CoinFlipVerdict;
  readonly message: string;
  readonly verdictMessage: string;
};

const STRENGTH_ORDER = [
  PROJECTION_STRENGTH.WEAK,
  PROJECTION_STRENGTH.STRONG,
  PROJECTION_STRENGTH.DECIDED,
] as const;

// Taxas, Wilson e frases saem aqui, em TypeScript, a partir das contagens inteiras do banco (ADR 0002, spec 009, P5 e P6).
export function toProjectionSummary(counts: ProjectionCounts): ProjectionSummaryView {
  const counted = counts.hits + counts.misses;
  const hitRate = computeRate({ part: counts.hits, total: counted });
  const upRate = computeRate({ part: counts.upMoves, total: counted });
  const insideRate = computeRate({ part: counts.inside, total: counts.banded });
  const judgement = judgeAgainstCoinFlip({ hits: counts.hits, counted });
  return {
    counted,
    hits: counts.hits,
    misses: counts.misses,
    ties: counts.ties,
    noSide: counts.noSide,
    pending: counts.pending,
    upMoves: counts.upMoves,
    banded: counts.banded,
    inside: counts.inside,
    hitRate,
    upRate,
    insideRate,
    byStrength: STRENGTH_ORDER.map((strength) => {
      const part = counts.byStrength[strength];
      const total = part.hits + part.misses;
      return {
        strength,
        counted: total,
        hits: part.hits,
        hitRate: computeRate({ part: part.hits, total }),
      };
    }),
    wilson:
      judgement.lower === null || judgement.upper === null
        ? null
        : { lower: judgement.lower, upper: judgement.upper },
    verdict: judgement.verdict,
    message: describeSummary({ hits: counts.hits, counted, hitRate, upRate, insideRate }),
    verdictMessage: describeVerdict(judgement.verdict),
  };
}
