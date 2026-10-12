// Copyright (c) 2026 Ada Technology. All rights reserved.
import {
  INTRADAY_VERDICT,
  recommendHorizon,
  toEngineDecimal,
  type HorizonSummary,
} from '@ativada/strategy-engine';

import type { DailyHorizonResult, IntradayHorizonResult } from './horizon-evaluation.types.js';

const ORDER_FIRST = -1;
const ORDER_LAST = 1;

// Texto decimal ou `null` (sem número): quem tem número vem antes, e o maior vem primeiro.
function compareDescending(left: string | null, right: string | null): number {
  if (left === null || right === null) {
    if (left === right) return 0;
    return left === null ? ORDER_LAST : ORDER_FIRST;
  }
  return toEngineDecimal(right).comparedTo(toEngineDecimal(left));
}

function compareFlag(left: boolean, right: boolean): number {
  if (left === right) return 0;
  return left ? ORDER_FIRST : ORDER_LAST;
}

function isEligible(summary: HorizonSummary): boolean {
  return recommendHorizon([summary]) !== undefined;
}

// Na linha de N dias vence a estratégia que passa na regra de recomendação; depois a de maior mediana. O empate fica
// com o menor id: a resposta não depende da ordem em que as estratégias chegaram.
function compareDaily(left: DailyHorizonResult, right: DailyHorizonResult): number {
  return (
    compareFlag(isEligible(left.summary), isEligible(right.summary)) ||
    compareDescending(left.summary.median, right.summary.median) ||
    left.strategy.id.localeCompare(right.strategy.id)
  );
}

function compareIntraday(left: IntradayHorizonResult, right: IntradayHorizonResult): number {
  return (
    compareFlag(
      left.summary.verdict === INTRADAY_VERDICT.WORTH,
      right.summary.verdict === INTRADAY_VERDICT.WORTH,
    ) ||
    compareDescending(left.summary.netReturn, right.summary.netReturn) ||
    left.strategy.id.localeCompare(right.strategy.id)
  );
}

export function pickBestDaily(
  candidates: readonly DailyHorizonResult[],
): DailyHorizonResult | undefined {
  return [...candidates].sort(compareDaily)[0];
}

export function pickBestIntraday(
  candidates: readonly IntradayHorizonResult[],
): IntradayHorizonResult | undefined {
  return [...candidates].sort(compareIntraday)[0];
}
