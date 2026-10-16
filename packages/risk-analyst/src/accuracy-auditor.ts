// Copyright (c) 2026 Ada Technology. All rights reserved.
import { COIN_FLIP_VERDICT, judgeAgainstCoinFlip, type CoinFlipVerdict } from '@ativada/statistics';
import { EngineDecimal, formatEngineDecimal } from '@ativada/strategy-engine';

import { ANALYST_RULES } from './analyst.constant.js';
import { compareDecimalTexts, decimalOf } from './analyst-decimal.js';
import type { AuditSummary, AuditWindow, VoteReading } from './analyst.types.js';

const RATE_DECIMAL_PLACES = 4;

type Tally = {
  predictions: number;
  unread: number;
  noSide: number;
  gap: number;
  hits: number;
  misses: number;
  ties: number;
  upMoves: number;
};

function createTally(): Tally {
  return { predictions: 0, unread: 0, noSide: 0, gap: 0, hits: 0, misses: 0, ties: 0, upMoves: 0 };
}

// Fração a 4 casas para BAIXO (como a `projection-1`); `null` sem denominador.
function rateOf(part: number, total: number): string | null {
  if (total === 0) return null;
  const rate = new EngineDecimal(part).dividedBy(total);
  return formatEngineDecimal(rate.toDecimalPlaces(RATE_DECIMAL_PLACES, EngineDecimal.ROUND_FLOOR));
}

function tallyMove(tally: Tally, reading: VoteReading, nextClose: string): void {
  const direction = compareDecimalTexts(nextClose, reading.close);
  if (direction === 0) {
    tally.ties += 1;
    return;
  }
  if (direction > 0) tally.upMoves += 1;
  const isUpVote = reading.vote === 1;
  const isHit = direction > 0 === isUpVote;
  if (isHit) tally.hits += 1;
  else tally.misses += 1;
}

// Uma previsão na vela `p`: sem leitura, sem lado, lacuna (a vela seguinte não existe), empate, acerto ou erro.
function tallyPrediction(tally: Tally, reading: VoteReading, nextClose: string | undefined): void {
  tally.predictions += 1;
  if (reading.vote === null) tally.unread += 1;
  else if (reading.vote === 0) tally.noSide += 1;
  else if (nextClose === undefined) tally.gap += 1;
  else tallyMove(tally, reading, nextClose);
}

// Peso D4-A: limite inferior − 0,5 só em `above`; quem não provou valor não vota (zero em tudo o mais).
function weightOf(verdict: CoinFlipVerdict, lower: string | null): string {
  if (verdict !== COIN_FLIP_VERDICT.ABOVE || lower === null) return '0';
  return formatEngineDecimal(decimalOf(lower).minus(ANALYST_RULES.weightBase));
}

// As W previsões mais novas cujo resultado já fechou até a vela `t` (RNF02): `p` com `t − (W + 1)·d < p ≤ t − d`. O
// resultado de `p` é o fechamento de `p + d` (D13); a vela `t` nunca conta e nada depois dela entra.
export function auditVotes(series: readonly VoteReading[], window: AuditWindow): AuditSummary {
  const { decisionTime, timeframeMilliseconds: duration, windowCandles } = window;
  const closeByOpen = new Map(series.map((reading) => [reading.openTime, reading.close]));
  const oldest = decisionTime - (windowCandles + 1) * duration;
  const tally = createTally();
  for (const reading of series) {
    const isInside = reading.openTime > oldest && reading.openTime <= decisionTime - duration;
    if (isInside) tallyPrediction(tally, reading, closeByOpen.get(reading.openTime + duration));
  }
  const counted = tally.hits + tally.misses;
  const judgement = judgeAgainstCoinFlip({ hits: tally.hits, counted });
  return {
    ...tally,
    counted,
    hitRate: rateOf(tally.hits, counted),
    upRate: rateOf(tally.upMoves, counted),
    verdict: judgement.verdict,
    lower: judgement.lower,
    upper: judgement.upper,
    weight: weightOf(judgement.verdict, judgement.lower),
  };
}
