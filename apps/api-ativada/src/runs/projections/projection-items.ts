// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { ProjectionItemRow } from '@ativada/database';
import { formatEngineDecimal, toEngineDecimal } from '@ativada/strategy-engine';

import {
  computeBand,
  computeMoveRate,
  isInsideBand,
  judgeMove,
  readSide,
  readSideThreshold,
  readStrength,
} from './projection-rule.js';
import {
  PROJECTION_RESULT,
  PROJECTION_SIDE,
  type ProjectionResult,
  type ProjectionSide,
  type ProjectionStrength,
} from './projections.constant.js';

export type ProjectionItemView = {
  readonly candleTime: number;
  readonly closedAt: number;
  readonly side: ProjectionSide;
  readonly strength: ProjectionStrength | null;
  readonly score: string;
  readonly base: string;
  readonly bandLow: string | null;
  readonly bandHigh: string | null;
  readonly nextClose: string | null;
  readonly moveRate: string | null;
  readonly result: ProjectionResult;
  readonly isInside: boolean | null;
};

export const canonicalText = (text: string): string => formatEngineDecimal(toEngineDecimal(text));

// Sem fechamento seguinte: ainda fora da faixa da execução (pendente) ou dentro dela e ausente em `candles` (lacuna).
function resolveResult(params: {
  readonly row: ProjectionItemRow;
  readonly side: ProjectionSide;
  readonly durationMilliseconds: number;
  readonly rangeEnd: number;
}): ProjectionResult {
  const { row, side } = params;
  if (side === PROJECTION_SIDE.NONE) return PROJECTION_RESULT.NO_SIDE;
  if (row.nextClose === null) {
    const isOutside = row.candleTime + params.durationMilliseconds >= params.rangeEnd;
    return isOutside ? PROJECTION_RESULT.PENDING : PROJECTION_RESULT.GAP;
  }
  return judgeMove({ side, close: row.close, nextClose: row.nextClose });
}

export function toProjectionItem(params: {
  readonly row: ProjectionItemRow;
  readonly durationMilliseconds: number;
  readonly rangeEnd: number;
}): ProjectionItemView {
  const { row } = params;
  const side = readSide(row.score);
  const threshold = readSideThreshold(side, { buy: row.buy, sell: row.sell });
  const band = computeBand({ close: row.close, atr: row.atr });
  const nextClose = row.nextClose === null ? null : canonicalText(row.nextClose);
  const hasSide = side !== PROJECTION_SIDE.NONE;
  return {
    candleTime: row.candleTime,
    closedAt: row.candleTime + params.durationMilliseconds,
    side,
    strength: hasSide ? readStrength({ score: row.score, threshold }) : null,
    score: canonicalText(row.score),
    base: canonicalText(row.close),
    bandLow: band?.low ?? null,
    bandHigh: band?.high ?? null,
    nextClose,
    moveRate: nextClose === null ? null : computeMoveRate({ close: row.close, nextClose }),
    result: resolveResult({ ...params, side }),
    isInside:
      band === null || nextClose === null || !hasSide ? null : isInsideBand({ band, nextClose }),
  };
}
