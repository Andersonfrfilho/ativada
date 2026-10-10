// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { Decimal } from 'decimal.js';

import { EngineDecimal, formatEngineDecimal, type EngineDecimalValue } from '../engine-decimal.js';
import { MILLISECONDS_PER_DAY } from '../metrics/metrics.constant.js';
import {
  GOAL_MEDIAN_DECIMAL_PLACES,
  GOAL_OUTCOME,
  GOAL_RATE_DECIMAL_PLACES,
  type GoalOutcome,
} from './goal.constant.js';
import type {
  GoalBenchmarkResult,
  GoalBenchmarkSummary,
  GoalNetReturn,
  GoalSummary,
  GoalWindowResult,
} from './goal.types.js';

export type SummarizeGoalParams = {
  readonly results: readonly GoalWindowResult[];
  readonly benchmarkResults: readonly GoalBenchmarkResult[];
  readonly initial: EngineDecimalValue;
  readonly candleDurationMilliseconds: number;
};

const TWO = new EngineDecimal(2);

function countOf(
  outcomes: readonly { readonly outcome: GoalOutcome }[],
  outcome: GoalOutcome,
): number {
  return outcomes.filter((entry) => entry.outcome === outcome).length;
}

// Taxas arredondadas contra o usuário: a de chegada para baixo, a de stop para cima.
function rateOf(params: {
  readonly count: number;
  readonly total: number;
  readonly rounding: Decimal.Rounding;
}): string | null {
  if (params.total === 0) return null;
  const rate = new EngineDecimal(params.count).dividedBy(params.total);
  return formatEngineDecimal(rate.toDecimalPlaces(GOAL_RATE_DECIMAL_PLACES, params.rounding));
}

function medianOf(sorted: readonly EngineDecimalValue[]): EngineDecimalValue | undefined {
  const middle = Math.floor(sorted.length / 2);
  const upper = sorted[middle];
  if (upper === undefined) return undefined;
  if (sorted.length % 2 === 1) return upper;
  const lower = sorted[middle - 1];
  return lower === undefined ? undefined : lower.plus(upper).dividedBy(TWO);
}

function sortAscending(values: readonly EngineDecimalValue[]): EngineDecimalValue[] {
  return [...values].sort((left, right) => left.comparedTo(right));
}

// O tempo até o alvo arredondado para CIMA (o pior): mediana dos candles que as janelas que chegaram levaram.
function medianTimes(params: SummarizeGoalParams): {
  readonly candles: string | null;
  readonly days: string | null;
} {
  const elapsed = params.results
    .filter((result) => result.outcome === GOAL_OUTCOME.REACHED)
    .map((result) => new EngineDecimal(result.candlesElapsed));
  const median = medianOf(sortAscending(elapsed));
  if (median === undefined) return { candles: null, days: null };
  const days = median.times(params.candleDurationMilliseconds).dividedBy(MILLISECONDS_PER_DAY);
  const up = (value: EngineDecimalValue): string =>
    formatEngineDecimal(
      value.toDecimalPlaces(GOAL_MEDIAN_DECIMAL_PLACES, EngineDecimal.ROUND_CEIL),
    );
  return { candles: up(median), days: up(days) };
}

// Retorno líquido de taxa e slippage (o patrimônio de liquidação do desfecho) sobre o saldo inicial, de TODAS as
// janelas, arredondado para baixo.
function netReturnOf(params: SummarizeGoalParams): GoalNetReturn {
  const { results, initial } = params;
  if (results.length === 0) return { mean: null, median: null };
  const gains = results.map((result) => result.finalValue.minus(initial));
  const toRate = (gain: EngineDecimalValue): string =>
    formatEngineDecimal(
      gain.dividedBy(initial).toDecimalPlaces(GOAL_RATE_DECIMAL_PLACES, EngineDecimal.ROUND_FLOOR),
    );
  const total = gains.reduce((sum, gain) => sum.plus(gain), new EngineDecimal(0));
  const median = medianOf(sortAscending(gains));
  return {
    mean: toRate(total.dividedBy(results.length)),
    median: median === undefined ? null : toRate(median),
  };
}

function summarizeBenchmark(results: readonly GoalBenchmarkResult[]): GoalBenchmarkSummary {
  const reachedCount = countOf(results, GOAL_OUTCOME.REACHED);
  const stoppedCount = countOf(results, GOAL_OUTCOME.STOPPED);
  const total = results.length;
  return {
    reachedCount,
    stoppedCount,
    reachRate: rateOf({ count: reachedCount, total, rounding: EngineDecimal.ROUND_FLOOR }),
    stopRate: rateOf({ count: stoppedCount, total, rounding: EngineDecimal.ROUND_CEIL }),
  };
}

export function summarizeGoalWindows(params: SummarizeGoalParams): GoalSummary {
  const { results } = params;
  const total = results.length;
  const reachedCount = countOf(results, GOAL_OUTCOME.REACHED);
  const stoppedCount = countOf(results, GOAL_OUTCOME.STOPPED);
  const expiredCount = countOf(results, GOAL_OUTCOME.EXPIRED);
  const times = medianTimes(params);
  return {
    windowCount: total,
    reachedCount,
    stoppedCount,
    expiredCount,
    reachRate: rateOf({ count: reachedCount, total, rounding: EngineDecimal.ROUND_FLOOR }),
    stopRate: rateOf({ count: stoppedCount, total, rounding: EngineDecimal.ROUND_CEIL }),
    expiredRate: rateOf({ count: expiredCount, total, rounding: EngineDecimal.ROUND_FLOOR }),
    medianCandlesToTarget: times.candles,
    medianDaysToTarget: times.days,
    netReturn: netReturnOf(params),
    benchmark: summarizeBenchmark(params.benchmarkResults),
  };
}
