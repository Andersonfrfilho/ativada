// Copyright (c) 2026 Ada Technology. All rights reserved.
import { auditVotes } from './accuracy-auditor.js';
import {
  ANALYST_RULES,
  AUDITED_KEYS,
  CANDLE_MILLISECONDS,
  STRATEGY_AUDIT_KEY,
  type AuditedKey,
} from './analyst.constant.js';
import type { SpecialistView, TeamSeries, VoteReading } from './analyst.types.js';
import { locateCandle } from './market-readings.js';

export type SpecialistViewsParams = {
  readonly team: TeamSeries;
  // A tendência da própria estratégia (A4): audita, mas não vota nem pesa.
  readonly strategyVotes: readonly VoteReading[];
  readonly candleTime: number;
};

type ViewParams = {
  readonly key: AuditedKey;
  readonly series: readonly VoteReading[];
  readonly candleTime: number;
};

// Voto na vela `t`, situação da leitura (sem leitura, aquecendo ou sem dado) e a contagem do auditor até `t`.
function viewOf(params: ViewParams): SpecialistView {
  const { key, series, candleTime } = params;
  const current = series[locateCandle(series, candleTime)];
  const summary = auditVotes(series, {
    decisionTime: candleTime,
    timeframeMilliseconds: CANDLE_MILLISECONDS,
    windowCandles: ANALYST_RULES.auditWindowCandles,
  });
  return {
    key,
    vote: current?.vote ?? null,
    isUnread: current === undefined || current.vote === null || current.isMissing,
    predictions: summary.predictions,
    counted: summary.counted,
    hits: summary.hits,
    misses: summary.misses,
    ties: summary.ties,
    upMoves: summary.upMoves,
    hitRate: summary.hitRate,
    upRate: summary.upRate,
    verdict: summary.verdict,
    lower: summary.lower,
    upper: summary.upper,
    weight: key === STRATEGY_AUDIT_KEY ? '0' : summary.weight,
  };
}

// Os quatro especialistas e a tendência da estratégia, nesta ordem.
export function buildSpecialistViews(params: SpecialistViewsParams): readonly SpecialistView[] {
  const { team, strategyVotes, candleTime } = params;
  return AUDITED_KEYS.map((key) =>
    viewOf({ key, series: key === STRATEGY_AUDIT_KEY ? strategyVotes : team[key], candleTime }),
  );
}
