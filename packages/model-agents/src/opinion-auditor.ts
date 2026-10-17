// Copyright (c) 2026 Ada Technology. All rights reserved.
import { judgeAgainstCoinFlip, type CoinFlipVerdict } from '@ativada/statistics';
import { EngineDecimal, formatEngineDecimal } from '@ativada/strategy-engine';

import { TEAM_ACTION, type TeamAction } from './team-report.schema.js';

const RATE_DECIMAL_PLACES = 4;
const CONFIDENCE_DECIMAL_PLACES = 2;

export const OPINION_KIND = { SCHEDULED: 'scheduled', ON_DEMAND: 'on_demand' } as const;
export type OpinionKind = (typeof OPINION_KIND)[keyof typeof OPINION_KIND];

export const OPINION_STATUS = {
  PENDING: 'pending',
  DECIDED: 'decided',
  FAILED: 'failed',
  SKIPPED: 'skipped',
} as const;
export type OpinionStatus = (typeof OPINION_STATUS)[keyof typeof OPINION_STATUS];

// Uma recomendação gravada com o fechamento da vela de decisão e o da vela seguinte (`t + 15 min`); `undefined` = a vela
// seguinte não existe ou ainda não fechou.
export type AuditReading = {
  readonly kind: OpinionKind;
  readonly status: OpinionStatus;
  readonly action: TeamAction | null;
  readonly confidence: number | null;
  readonly candleTime: number;
  readonly close: string;
  readonly nextClose: string | undefined;
};

export type AuditParams = {
  readonly readings: readonly AuditReading[];
  // Início da janela de 30 dias, inclusivo: o chamador o calcula do relógio.
  readonly windowStartMilliseconds: number;
};

export type OpinionAuditSummary = {
  readonly counted: number;
  readonly hits: number;
  readonly misses: number;
  readonly ties: number;
  readonly gaps: number;
  readonly hitRate: string | null;
  readonly verdict: CoinFlipVerdict;
  readonly lower: string | null;
  readonly upper: string | null;
  readonly averageConfidenceOnHit: string | null;
  readonly averageConfidenceOnMiss: string | null;
};

type Tally = {
  hits: number;
  misses: number;
  ties: number;
  gaps: number;
  hitConfidenceSum: number;
  missConfidenceSum: number;
};

// Só conta a recomendação AGENDADA, decidida, com lado (compra ou venda) e dentro da janela (RF16).
function isCountable(reading: AuditReading, windowStart: number): boolean {
  if (reading.kind !== OPINION_KIND.SCHEDULED || reading.status !== OPINION_STATUS.DECIDED) {
    return false;
  }
  const hasSide = reading.action === TEAM_ACTION.BUY || reading.action === TEAM_ACTION.SELL;
  return hasSide && reading.candleTime >= windowStart;
}

function rateOf(part: number, total: number): string | null {
  if (total === 0) return null;
  const rate = new EngineDecimal(part).dividedBy(total);
  return formatEngineDecimal(rate.toDecimalPlaces(RATE_DECIMAL_PLACES, EngineDecimal.ROUND_FLOOR));
}

function averageOf(sum: number, count: number): string | null {
  if (count === 0) return null;
  const average = new EngineDecimal(sum).dividedBy(count);
  return formatEngineDecimal(
    average.toDecimalPlaces(CONFIDENCE_DECIMAL_PLACES, EngineDecimal.ROUND_FLOOR),
  );
}

function tallyReading(tally: Tally, reading: AuditReading): void {
  if (reading.nextClose === undefined) {
    tally.gaps += 1;
    return;
  }
  const direction = new EngineDecimal(reading.nextClose).comparedTo(reading.close);
  if (direction === 0) {
    tally.ties += 1;
    return;
  }
  const isBuy = reading.action === TEAM_ACTION.BUY;
  const isHit = direction > 0 === isBuy;
  const confidence = reading.confidence ?? 0;
  if (isHit) {
    tally.hits += 1;
    tally.hitConfidenceSum += confidence;
  } else {
    tally.misses += 1;
    tally.missConfidenceSum += confidence;
  }
}

// O placar de acertos de lado de UMA equipe num par (RF16): `buy` acerta se a vela seguinte fechou acima, `sell` se fechou
// abaixo; empate e lacuna não contam; o veredito é o do Wilson único contra a moeda ao ar.
export function auditOpinions(params: AuditParams): OpinionAuditSummary {
  const tally: Tally = {
    hits: 0,
    misses: 0,
    ties: 0,
    gaps: 0,
    hitConfidenceSum: 0,
    missConfidenceSum: 0,
  };
  for (const reading of params.readings) {
    if (isCountable(reading, params.windowStartMilliseconds)) tallyReading(tally, reading);
  }
  const counted = tally.hits + tally.misses;
  const judgement = judgeAgainstCoinFlip({ hits: tally.hits, counted });
  return {
    counted,
    hits: tally.hits,
    misses: tally.misses,
    ties: tally.ties,
    gaps: tally.gaps,
    hitRate: rateOf(tally.hits, counted),
    verdict: judgement.verdict,
    lower: judgement.lower,
    upper: judgement.upper,
    averageConfidenceOnHit: averageOf(tally.hitConfidenceSum, tally.hits),
    averageConfidenceOnMiss: averageOf(tally.missConfidenceSum, tally.misses),
  };
}
