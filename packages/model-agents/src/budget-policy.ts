// Copyright (c) 2026 Ada Technology. All rights reserved.
import { EngineDecimal } from '@ativada/strategy-engine';

export const BUDGET_DECISION = {
  ALLOW: 'allow',
  DENY_DAY: 'deny_day',
  DENY_MONTH: 'deny_month',
} as const;
export type BudgetDecision = (typeof BUDGET_DECISION)[keyof typeof BUDGET_DECISION];

export type BudgetLimits = { readonly dailyUsd: string; readonly monthlyUsd: string };

// Soma do que já foi gravado e do que está reservado em voo, no dia (UTC) e no mês (UTC).
export type BudgetUsage = { readonly dayUsd: string; readonly monthUsd: string };

export type DecideBudgetParams = {
  readonly usage: BudgetUsage;
  readonly reservationUsd: string;
  readonly limits: BudgetLimits;
};

function exceeds(params: {
  readonly used: string;
  readonly reservation: string;
  readonly limit: string;
}): boolean {
  return new EngineDecimal(params.used).plus(params.reservation).greaterThan(params.limit);
}

// RF16: passar do teto é recusar; ficar EXATAMENTE no teto ainda cabe. Compara em decimal exato; o dia vence o mês.
export function decideBudget(params: DecideBudgetParams): BudgetDecision {
  const { usage, reservationUsd, limits } = params;
  if (exceeds({ used: usage.dayUsd, reservation: reservationUsd, limit: limits.dailyUsd })) {
    return BUDGET_DECISION.DENY_DAY;
  }
  if (exceeds({ used: usage.monthUsd, reservation: reservationUsd, limit: limits.monthlyUsd })) {
    return BUDGET_DECISION.DENY_MONTH;
  }
  return BUDGET_DECISION.ALLOW;
}
