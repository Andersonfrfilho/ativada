// Copyright (c) 2026 Ada Technology. All rights reserved.
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';

import {
  runGoalMutant,
  type GoalMutantVerdict,
  type GoalSourceEdit,
  type GoalSourceMutant,
} from './fixtures/strategy-engine/goal/goal-mutation.fixture.js';
import { removeMutants } from './fixtures/strategy-engine/signal/signal-mutation.fixture.js';

const MUTANT_TIMEOUT_MILLISECONDS = 1_800_000;
const PARALLEL_MUTANTS = 4;
const CONTROL: GoalSourceMutant = { name: 'CONTROL', edits: [] };
const LEVELS = 'goal/goal-levels.ts';
const OUTCOME = 'goal/goal-window-outcome.ts';
const PROGRESS = 'goal/goal-progress.ts';
const WINDOWS = 'goal/goal-windows.ts';
const SUMMARY = 'goal/goal-summary.ts';
const VERDICT = 'goal/goal-verdict.ts';
const CONSTANT = 'goal/goal.constant.ts';
const INPUT = 'goal/goal-input.ts';
const SPEC = 'goal/goal-spec.schema.ts';
const SIGNALS = 'goal/goal-signals.ts';
const TRAJECTORY = 'goal/goal-trajectory.ts';
const BENCHMARK = 'goal/goal-benchmark.ts';
const EVALUATE = 'goal/evaluate-goal.ts';
const RANKING = 'goal/goal-ranking.ts';
const FLOOR_RATE = 'rounding: EngineDecimal.ROUND_FLOOR }';
const CEIL_RATE = 'rounding: EngineDecimal.ROUND_CEIL }';

function edit(file: string, find: string, replace: string, occurrences = 1): GoalSourceEdit[] {
  return [{ file, find, replace, occurrences }];
}

const MUTANTS: readonly GoalSourceMutant[] = [
  {
    name: 'TARGET_LEVEL_ROUNDED_DOWN',
    edits: edit(
      LEVELS,
      'moneyUp(initial.times(ONE.plus(toEngineDecimal(goal.targetRate))))',
      'initial.times(ONE.plus(toEngineDecimal(goal.targetRate))).toDecimalPlaces(8, EngineDecimal.ROUND_FLOOR)',
    ),
  },
  {
    name: 'STOP_LEVEL_ROUNDED_DOWN',
    edits: edit(
      LEVELS,
      'moneyUp(initial.times(ONE.minus(toEngineDecimal(goal.maxLossRate))))',
      'initial.times(ONE.minus(toEngineDecimal(goal.maxLossRate))).toDecimalPlaces(8, EngineDecimal.ROUND_FLOOR)',
    ),
  },
  {
    name: 'STOP_LEVEL_ABOVE_THE_BALANCE',
    edits: edit(
      LEVELS,
      'ONE.minus(toEngineDecimal(goal.maxLossRate))',
      'ONE.plus(toEngineDecimal(goal.maxLossRate))',
    ),
  },
  {
    name: 'STOP_NEEDS_TO_GO_STRICTLY_BELOW',
    edits: edit(
      PROGRESS,
      'point.equityAtLow.lte(levels.stop)',
      'point.equityAtLow.lt(levels.stop)',
    ),
  },
  {
    name: 'TARGET_NEEDS_TO_GO_STRICTLY_ABOVE',
    edits: edit(PROGRESS, 'point.equity.gte(levels.target)', 'point.equity.gt(levels.target)'),
  },
  {
    name: 'STOP_LOOKS_AT_THE_CLOSE',
    edits: edit(PROGRESS, 'point.equityAtLow.lte(levels.stop)', 'point.equity.lte(levels.stop)'),
  },
  {
    name: 'TARGET_LOOKS_AT_THE_LOW',
    edits: edit(
      PROGRESS,
      'point.equity.gte(levels.target)',
      'point.equityAtLow.gte(levels.target)',
    ),
  },
  {
    name: 'TARGET_WINS_THE_SAME_CANDLE',
    edits: edit(
      PROGRESS,
      'if (point.equityAtLow.lte(levels.stop)) return',
      'if (!point.equity.gte(levels.target) && point.equityAtLow.lte(levels.stop)) return',
    ),
  },
  {
    name: 'STOPPED_VALUE_AT_THE_CLOSE',
    edits: edit(
      PROGRESS,
      'outcome === GOAL_OUTCOME.STOPPED ? point.equityAtLow : point.equity',
      'point.equity',
    ),
  },
  {
    name: 'ELAPSED_COUNTS_FROM_ZERO',
    edits: edit(OUTCOME, 'candlesElapsed: offset + 1,', 'candlesElapsed: offset,'),
  },
  {
    name: 'EXPIRED_VALUE_AT_THE_FIRST_CANDLE',
    edits: edit(OUTCOME, 'params.pointAt(horizonCandles - 1).equity', 'params.pointAt(0).equity'),
  },
  {
    name: 'LAST_CANDLE_OF_THE_TERM_IGNORED',
    edits: edit(OUTCOME, 'offset < horizonCandles;', 'offset < horizonCandles - 1;'),
  },
  {
    name: 'REACH_RATE_ROUNDED_UP',
    edits: edit(
      SUMMARY,
      `reachRate: rateOf({ count: reachedCount, total, ${FLOOR_RATE}`,
      `reachRate: rateOf({ count: reachedCount, total, ${CEIL_RATE}`,
      2,
    ),
  },
  {
    name: 'STOP_RATE_ROUNDED_DOWN',
    edits: edit(
      SUMMARY,
      `stopRate: rateOf({ count: stoppedCount, total, ${CEIL_RATE}`,
      `stopRate: rateOf({ count: stoppedCount, total, ${FLOOR_RATE}`,
      2,
    ),
  },
  {
    name: 'EXPIRED_RATE_ROUNDED_UP',
    edits: edit(
      SUMMARY,
      `expiredRate: rateOf({ count: expiredCount, total, ${FLOOR_RATE}`,
      `expiredRate: rateOf({ count: expiredCount, total, ${CEIL_RATE}`,
    ),
  },
  {
    name: 'ODD_MEDIAN_TAKES_THE_UPPER_NEIGHBOUR',
    edits: edit(
      SUMMARY,
      'const middle = Math.floor(sorted.length / 2);',
      'const middle = Math.ceil(sorted.length / 2);',
    ),
  },
  {
    name: 'EVEN_MEDIAN_TAKES_THE_UPPER_MIDDLE',
    edits: edit(SUMMARY, 'lower.plus(upper).dividedBy(TWO)', 'upper'),
  },
  {
    name: 'MEDIAN_TIME_ROUNDED_DOWN',
    edits: edit(
      SUMMARY,
      'GOAL_MEDIAN_DECIMAL_PLACES, EngineDecimal.ROUND_CEIL',
      'GOAL_MEDIAN_DECIMAL_PLACES, EngineDecimal.ROUND_FLOOR',
    ),
  },
  {
    name: 'MEDIAN_DAYS_IS_THE_CANDLE_COUNT',
    edits: edit(
      SUMMARY,
      'median.times(params.candleDurationMilliseconds).dividedBy(MILLISECONDS_PER_DAY)',
      'median',
    ),
  },
  {
    name: 'MEDIAN_TIME_COUNTS_EVERY_WINDOW',
    edits: edit(SUMMARY, '.filter((result) => result.outcome === GOAL_OUTCOME.REACHED)', ''),
  },
  {
    name: 'NET_RETURN_ROUNDED_UP',
    edits: edit(
      SUMMARY,
      'GOAL_RATE_DECIMAL_PLACES, EngineDecimal.ROUND_FLOOR),\n    );',
      'GOAL_RATE_DECIMAL_PLACES, EngineDecimal.ROUND_CEIL),\n    );',
    ),
  },
  {
    name: 'NET_RETURN_MEAN_IS_THE_TOTAL',
    edits: edit(SUMMARY, 'total.dividedBy(results.length)', 'total'),
  },
  {
    name: 'NET_RETURN_RELATIVE_TO_ZERO',
    edits: edit(SUMMARY, 'result.finalValue.minus(initial)', 'result.finalValue'),
  },
  {
    name: 'BENCHMARK_REACH_COUNTS_STOPS',
    edits: edit(
      SUMMARY,
      'const reachedCount = countOf(results, GOAL_OUTCOME.REACHED);\n  const stoppedCount = countOf(results, GOAL_OUTCOME.STOPPED);\n  const total = results.length;',
      'const reachedCount = countOf(results, GOAL_OUTCOME.STOPPED);\n  const stoppedCount = countOf(results, GOAL_OUTCOME.STOPPED);\n  const total = results.length;',
    ),
  },
  {
    name: 'VERDICT_BUY_REACH_STRICT',
    edits: edit(
      VERDICT,
      'toEngineDecimal(params.rate).times(params.windowCount).lte(params.count)',
      'toEngineDecimal(params.rate).times(params.windowCount).lt(params.count)',
    ),
  },
  {
    name: 'VERDICT_MAXIMUM_RATE_STRICT',
    edits: edit(
      VERDICT,
      'toEngineDecimal(params.rate).times(params.windowCount).gte(params.count)',
      'toEngineDecimal(params.rate).times(params.windowCount).gt(params.count)',
    ),
  },
  {
    name: 'VERDICT_MINIMUM_WINDOWS_INCLUSIVE',
    edits: edit(
      VERDICT,
      'windowCount < rules.minimumWindows',
      'windowCount <= rules.minimumWindows',
    ),
  },
  {
    name: 'VERDICT_BUYS_WITHOUT_CHECKING_THE_STOP',
    edits: edit(
      VERDICT,
      '&&\n    isRateAtMost({ ...stop, rate: rules.buyMaximumStopRate })',
      '||\n    isRateAtMost({ ...stop, rate: rules.buyMaximumStopRate })',
    ),
  },
  {
    name: 'VERDICT_AVOID_ONLY_BY_STOP',
    edits: edit(
      VERDICT,
      ' ||\n    isRateAtMost({ ...reach, rate: rules.avoidMaximumReachRate })',
      '',
    ),
  },
  {
    name: 'VERDICT_AVOID_ONLY_BY_REACH',
    edits: edit(
      VERDICT,
      'isRateAtLeast({ ...stop, rate: rules.avoidMinimumStopRate }) ||\n    ',
      '',
    ),
  },
  {
    name: 'RULE_BUY_REACH_RAISED',
    edits: edit(CONSTANT, "buyMinimumReachRate: '0.5'", "buyMinimumReachRate: '0.51'"),
  },
  {
    name: 'RULE_BUY_STOP_RAISED',
    edits: edit(CONSTANT, "buyMaximumStopRate: '0.25'", "buyMaximumStopRate: '0.26'"),
  },
  {
    name: 'RULE_AVOID_STOP_LOWERED',
    edits: edit(CONSTANT, "avoidMinimumStopRate: '0.4'", "avoidMinimumStopRate: '0.39'"),
  },
  {
    name: 'RULE_AVOID_REACH_RAISED',
    edits: edit(CONSTANT, "avoidMaximumReachRate: '0.15'", "avoidMaximumReachRate: '0.16'"),
  },
  {
    name: 'RULE_MINIMUM_WINDOWS_LOWERED',
    edits: edit(CONSTANT, 'minimumWindows: 20', 'minimumWindows: 19'),
  },
  {
    name: 'LAST_WINDOW_DROPPED',
    edits: edit(WINDOWS, 'start <= last;', 'start < last;'),
  },
  {
    name: 'FIRST_WINDOW_SKIPPED',
    edits: edit(WINDOWS, 'let start = first;', 'let start = first + 1;'),
  },
  {
    name: 'WINDOWS_STEP_TWO_CANDLES',
    edits: edit(WINDOWS, 'start <= last; start += 1', 'start <= last; start += 2'),
  },
  {
    name: 'NEXT_BUY_LOOKS_AT_SELLS',
    edits: edit(
      WINDOWS,
      'signals[index]?.action === SIGNAL_ACTION.BUY',
      'signals[index]?.action === SIGNAL_ACTION.SELL',
    ),
  },
  {
    name: 'NEXT_BUY_SKIPS_THE_CURRENT_CANDLE',
    edits: edit(
      WINDOWS,
      'isBuy ? index : (next[index + 1] ?? signals.length)',
      'next[index + 1] ?? signals.length',
    ),
  },
  {
    name: 'TRAJECTORY_SHIFTED_BY_ONE',
    edits: edit(
      WINDOWS,
      'trajectory[start + offset - buy]',
      'trajectory[start + offset - buy + 1]',
    ),
  },
  {
    name: 'TRAJECTORY_ONLY_WHEN_THE_BUY_IS_AFTER_THE_START',
    edits: edit(
      WINDOWS,
      'buy < start + horizonCandles ? readTrajectory(buy) : []',
      'buy < start + horizonCandles - 2 ? readTrajectory(buy) : []',
    ),
  },
  {
    name: 'TRAJECTORY_STARTS_ONE_CANDLE_LATE',
    edits: edit(
      TRAJECTORY,
      'for (let index = startIndex; index < end; index += 1)',
      'for (let index = startIndex + 1; index < end; index += 1)',
    ),
  },
  {
    name: 'TRAJECTORY_ONE_CANDLE_SHORT',
    edits: edit(
      TRAJECTORY,
      'startIndex + context.horizonCandles,',
      'startIndex + context.horizonCandles - 1,',
    ),
  },
  {
    name: 'SENTIMENT_IGNORED',
    edits: edit(SIGNALS, 'sentiment: params.sentiments?.[index],', 'sentiment: undefined,'),
  },
  {
    name: 'BENCHMARK_BUYS_AT_THE_FIRST_CANDLE',
    edits: edit(BENCHMARK, 'candles[windowStart + 1]', 'candles[windowStart]'),
  },
  {
    name: 'BENCHMARK_STARTS_ALREADY_BOUGHT',
    edits: edit(
      BENCHMARK,
      'if (offset === 0 || candle === undefined) return initialPoint;',
      'if (candle === undefined) return initialPoint;',
    ),
  },
  {
    name: 'GAP_ACCEPTED',
    edits: edit(INPUT, 'candle.openTime !== previous + duration', 'false as boolean'),
  },
  {
    name: 'CANDLE_SHAPE_NOT_CHECKED',
    edits: edit(INPUT, 'assertCandleShape(candle, params.run.parameters);', ''),
  },
  {
    name: 'SENTIMENT_LENGTH_UNCHECKED',
    edits: edit(
      INPUT,
      'sentiments !== undefined && sentiments.length !== candles.length',
      'false as boolean',
    ),
  },
  {
    name: 'HORIZON_IN_CANDLES_IS_THE_DAYS',
    edits: edit(
      INPUT,
      'horizonCandles: horizonMilliseconds / duration,',
      'horizonCandles: goal.horizonDays,',
    ),
  },
  {
    name: 'UNKNOWN_GOAL_FIELD_ACCEPTED',
    edits: edit(SPEC, 'z.strictObject({', 'z.object({'),
  },
  {
    name: 'ZERO_TARGET_ACCEPTED',
    edits: edit(
      SPEC,
      '  maximum: MAXIMUM_GOAL_TARGET_RATE,\n  isMinimumExclusive: true,\n',
      '  maximum: MAXIMUM_GOAL_TARGET_RATE,\n',
    ),
  },
  {
    name: 'TOTAL_LOSS_ACCEPTED',
    edits: edit(SPEC, '  isMaximumExclusive: true,\n', ''),
  },
  {
    name: 'FRACTIONAL_HORIZON_ACCEPTED',
    edits: edit(SPEC, 'z.number().int().min(1)', 'z.number().min(1)'),
  },
  {
    name: 'HORIZON_ABOVE_THE_CEILING_ACCEPTED',
    edits: edit(CONSTANT, 'MAXIMUM_GOAL_HORIZON_DAYS = 365', 'MAXIMUM_GOAL_HORIZON_DAYS = 366'),
  },
  {
    name: 'GOAL_ECHOED_WITHOUT_NORMALIZING',
    edits: edit(EVALUATE, 'goal: parsed.goal,', 'goal: params.goal,'),
  },
  {
    name: 'FIRST_WINDOW_TIME_IS_THE_LAST',
    edits: edit(
      EVALUATE,
      'firstWindowIndex === undefined ? null : (candles[firstWindowIndex]?.openTime ?? null)',
      'firstWindowIndex === undefined ? null : (candles[lastWindowIndex ?? 0]?.openTime ?? null)',
    ),
  },
  {
    name: 'RANKING_REACH_ASCENDING',
    edits: edit(
      RANKING,
      'return right.reachedCount * left.windowCount - left.reachedCount * right.windowCount;',
      'return left.reachedCount * right.windowCount - right.reachedCount * left.windowCount;',
    ),
  },
  {
    name: 'RANKING_STOP_DESCENDING',
    edits: edit(
      RANKING,
      'return left.stoppedCount * right.windowCount - right.stoppedCount * left.windowCount;',
      'return right.stoppedCount * left.windowCount - left.stoppedCount * right.windowCount;',
    ),
  },
  {
    name: 'RANKING_FEWER_WINDOWS_FIRST',
    edits: edit(
      RANKING,
      'second.windowCount - first.windowCount',
      'first.windowCount - second.windowCount',
    ),
  },
  {
    name: 'RANKING_KEYS_DESCENDING',
    edits: edit(
      RANKING,
      'if (left < right) return -1;\n  return left > right ? 1 : 0;',
      'if (left < right) return 1;\n  return left > right ? -1 : 0;',
    ),
  },
  {
    name: 'RANKING_EMPTY_FIRST',
    edits: edit(RANKING, 'return isFirstEmpty ? 1 : -1;', 'return isFirstEmpty ? -1 : 1;'),
  },
  {
    name: 'RANKING_SORTS_THE_INPUT_IN_PLACE',
    edits: edit(
      RANKING,
      'return [...combinations].sort(compareCombinations);',
      'return (combinations as TCombination[]).sort(compareCombinations);',
    ),
  },
];

describe('mutantes da avaliação de metas', () => {
  const verdicts = new Map<string, GoalMutantVerdict>();

  beforeAll(async () => {
    const queue = [CONTROL, ...MUTANTS];
    const worker = async (): Promise<void> => {
      for (let next = queue.shift(); next !== undefined; next = queue.shift()) {
        verdicts.set(next.name, await runGoalMutant(next));
      }
    };
    await Promise.all(Array.from({ length: PARALLEL_MUTANTS }, worker));
  }, MUTANT_TIMEOUT_MILLISECONDS);

  afterAll(removeMutants);

  test('the control copy (no edit) passes the same tests: the harness is sound', () => {
    expect(verdicts.get(CONTROL.name)).toStrictEqual({
      exitCode: 0,
      failedTests: 0,
      hasLoadError: false,
    });
  });

  test.each(MUTANTS.map((mutant) => [mutant.name, mutant] as const))('%s', (_name, mutant) => {
    const verdict = verdicts.get(mutant.name);
    expect(verdict?.problem).toBeUndefined();
    expect(verdict?.hasLoadError).toBe(false);
    expect(verdict?.exitCode).not.toBe(0);
    expect(verdict?.failedTests ?? 0).toBeGreaterThan(0);
  });
});
