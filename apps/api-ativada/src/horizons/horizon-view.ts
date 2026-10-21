// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { HorizonDistribution, IntradaySummary } from '@ativada/strategy-engine';

import type { GoalStrategyRef } from '../goals/goal-evaluation-view.js';
import { HORIZON_INTRADAY_DAYS, HORIZON_INTRADAY_TIMEFRAME } from './horizon.constant.js';
import type {
  DailyHorizonResult,
  HorizonEvaluation,
  HorizonUnavailable,
  IntradayHorizonResult,
} from './horizon-evaluation.types.js';
import {
  describeDailyRow,
  describeIntradayRow,
  describeRecommendation,
} from './horizon-messages.js';

export const HORIZON_ROW_KIND = { INTRADAY: 'intraday', DAILY: 'daily' } as const;

export type IntradayRowView = IntradaySummary & {
  readonly kind: typeof HORIZON_ROW_KIND.INTRADAY;
  readonly timeframe: typeof HORIZON_INTRADAY_TIMEFRAME;
  readonly days: number;
  readonly strategy: GoalStrategyRef;
  readonly message: string;
};

export type DailyRowView = {
  readonly kind: typeof HORIZON_ROW_KIND.DAILY;
  readonly horizonDays: number;
  readonly strategy: GoalStrategyRef;
  readonly windowCount: number;
  readonly positiveCount: number;
  readonly median: string | null;
  readonly positiveRate: string | null;
  readonly worstDecile: string | null;
  readonly isShortHistory: boolean;
  readonly benchmark: HorizonDistribution;
  // No máximo uma linha de dias leva o selo "Recomendável"; a de 15 minutos nunca.
  readonly isRecommended: boolean;
  readonly message: string;
};

export type HorizonsView = {
  readonly symbol: string;
  readonly evaluatedStrategies: number;
  readonly isStrategyListTruncated: boolean;
  // Na ordem do spec: 15 minutos, 7, 15 e 30 dias.
  readonly rows: readonly (IntradayRowView | DailyRowView)[];
  readonly recommendedHorizonDays: number | null;
  readonly recommendationMessage: string;
  readonly unavailable: readonly HorizonUnavailable[];
};

function toIntradayRow(result: IntradayHorizonResult): IntradayRowView {
  return {
    kind: HORIZON_ROW_KIND.INTRADAY,
    timeframe: HORIZON_INTRADAY_TIMEFRAME,
    days: HORIZON_INTRADAY_DAYS,
    strategy: result.strategy,
    ...result.summary,
    message: describeIntradayRow(result.summary),
  };
}

function toDailyRow(
  result: DailyHorizonResult,
  recommendedHorizonDays: number | undefined,
): DailyRowView {
  const { summary } = result;
  const isRecommended = summary.horizonDays === recommendedHorizonDays;
  return {
    kind: HORIZON_ROW_KIND.DAILY,
    horizonDays: summary.horizonDays,
    strategy: result.strategy,
    windowCount: summary.windowCount,
    positiveCount: summary.positiveCount,
    median: summary.median,
    positiveRate: summary.positiveRate,
    worstDecile: summary.worstDecile,
    isShortHistory: summary.isShortHistory,
    benchmark: summary.benchmark,
    isRecommended,
    message: describeDailyRow({ summary, isRecommended }),
  };
}

// A resposta da rota: os números do motor mais as frases em português simples (RF06), escritas aqui.
export function toHorizonsView(evaluation: HorizonEvaluation): HorizonsView {
  const { recommendedHorizonDays } = evaluation;
  return {
    symbol: evaluation.symbol,
    evaluatedStrategies: evaluation.evaluatedStrategies,
    isStrategyListTruncated: evaluation.isStrategyListTruncated,
    rows: [
      ...(evaluation.intraday === undefined ? [] : [toIntradayRow(evaluation.intraday)]),
      ...evaluation.daily.map((row) => toDailyRow(row, recommendedHorizonDays)),
    ],
    recommendedHorizonDays: recommendedHorizonDays ?? null,
    recommendationMessage: describeRecommendation({
      evaluatedStrategies: evaluation.evaluatedStrategies,
      hasDailyRows: evaluation.daily.length > 0,
      recommendedHorizonDays,
    }),
    unavailable: evaluation.unavailable,
  };
}
