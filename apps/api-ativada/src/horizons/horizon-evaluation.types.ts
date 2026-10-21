// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { HorizonSummary, IntradaySummary } from '@ativada/strategy-engine';

import type { GoalStrategyRef } from '../goals/goal-evaluation-view.js';

export type DailyHorizonResult = {
  readonly strategy: GoalStrategyRef;
  readonly summary: HorizonSummary;
};

export type IntradayHorizonResult = {
  readonly strategy: GoalStrategyRef;
  readonly summary: IntradaySummary;
};

export type HorizonUnavailable = { readonly strategyId: string; readonly reason: string };

// O resultado de UMA moeda: a melhor estratégia por linha (7, 15 e 30 dias, e a de 15 minutos) e o prazo recomendável.
export type HorizonEvaluation = {
  readonly symbol: string;
  readonly evaluatedStrategies: number;
  // Havia mais estratégias do que cabem na avaliação: só as mais novas entraram.
  readonly isStrategyListTruncated: boolean;
  readonly daily: readonly DailyHorizonResult[];
  readonly intraday: IntradayHorizonResult | undefined;
  readonly recommendedHorizonDays: number | undefined;
  readonly unavailable: readonly HorizonUnavailable[];
};
