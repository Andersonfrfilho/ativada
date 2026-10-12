// Copyright (c) 2026 Ada Technology. All rights reserved.
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';

import {
  HORIZON_FULL_JUDGE_TEST_FILES,
  runHorizonMutant,
  type HorizonMutantVerdict,
  type HorizonSourceEdit,
  type HorizonSourceMutant,
} from './fixtures/strategy-engine/horizon/horizon-mutation.fixture.js';
import { removeMutants } from './fixtures/strategy-engine/signal/signal-mutation.fixture.js';

const MUTANT_TIMEOUT_MILLISECONDS = 1_800_000;
const PARALLEL_MUTANTS = 4;
const CONTROL: HorizonSourceMutant = { name: 'CONTROL', edits: [] };
const RECOMMEND = 'horizon/recommend-horizon.ts';
const SUMMARY = 'horizon/summarize-horizon.ts';
const WINDOWS = 'horizon/compute-horizon-windows.ts';
const CONSTANT = 'horizon/horizon.constant.ts';

function edit(file: string, find: string, replace: string, occurrences = 1): HorizonSourceEdit[] {
  return [{ file, find, replace, occurrences }];
}

const MUTANTS: readonly HorizonSourceMutant[] = [
  {
    name: 'MEDIAN_AT_ZERO_IS_ELIGIBLE',
    edits: edit(RECOMMEND, 'median).greaterThan(ZERO)', 'median).greaterThanOrEqualTo(ZERO)'),
  },
  {
    name: 'POSITIVE_SHARE_AT_THE_THRESHOLD_IS_REJECTED',
    edits: edit(
      RECOMMEND,
      'row.positiveCount * PERCENT < rules.minimumPositivePercent',
      'row.positiveCount * PERCENT <= rules.minimumPositivePercent',
    ),
  },
  {
    name: 'WORST_DECILE_AT_THE_THRESHOLD_IS_REJECTED',
    edits: edit(
      RECOMMEND,
      '.greaterThanOrEqualTo(rules.minimumWorstDecile)',
      '.greaterThan(rules.minimumWorstDecile)',
    ),
  },
  {
    name: 'SHORT_HISTORY_IS_ELIGIBLE',
    edits: edit(RECOMMEND, 'row.isShortHistory || ', ''),
  },
  {
    name: 'TIE_PREFERS_THE_SHORTER_HORIZON',
    edits: edit(
      RECOMMEND,
      'right.horizonDays - left.horizonDays',
      'left.horizonDays - right.horizonDays',
    ),
  },
  {
    name: 'RANKING_USES_THE_MEDIAN_NOT_PER_DAY',
    edits: edit(RECOMMEND, '.dividedBy(row.horizonDays)', '.dividedBy(1)'),
  },
  {
    name: 'RANKING_PREFERS_THE_LOWER_MEDIAN_PER_DAY',
    edits: edit(
      RECOMMEND,
      'right.medianPerDay.comparedTo(left.medianPerDay)',
      'left.medianPerDay.comparedTo(right.medianPerDay)',
    ),
  },
  {
    name: 'MEDIAN_PER_DAY_NOT_ROUNDED',
    edits: edit(
      RECOMMEND,
      '.toDecimalPlaces(HORIZON_RATE_DECIMAL_PLACES, EngineDecimal.ROUND_FLOOR),',
      '',
    ),
  },
  {
    name: 'MEDIAN_PER_DAY_ROUNDED_HALF_UP',
    edits: edit(RECOMMEND, 'EngineDecimal.ROUND_FLOOR', 'EngineDecimal.ROUND_HALF_UP'),
  },
  {
    name: 'MEDIAN_PER_DAY_ROUNDED_UP',
    edits: edit(RECOMMEND, 'EngineDecimal.ROUND_FLOOR', 'EngineDecimal.ROUND_CEIL'),
  },
  {
    name: 'MINIMUM_WINDOWS_LOWERED',
    edits: edit(CONSTANT, 'minimumWindows: 60', 'minimumWindows: 59'),
  },
  {
    name: 'MINIMUM_WINDOWS_RAISED',
    edits: edit(CONSTANT, 'minimumWindows: 60', 'minimumWindows: 61'),
  },
  {
    name: 'MINIMUM_POSITIVE_PERCENT_LOWERED',
    edits: edit(CONSTANT, 'minimumPositivePercent: 55', 'minimumPositivePercent: 54'),
  },
  {
    name: 'MINIMUM_POSITIVE_PERCENT_RAISED',
    edits: edit(CONSTANT, 'minimumPositivePercent: 55', 'minimumPositivePercent: 56'),
  },
  {
    name: 'MINIMUM_WORST_DECILE_LOWERED',
    edits: edit(CONSTANT, "minimumWorstDecile: '-0.1'", "minimumWorstDecile: '-0.11'"),
  },
  {
    name: 'MINIMUM_WORST_DECILE_RAISED',
    edits: edit(CONSTANT, "minimumWorstDecile: '-0.1'", "minimumWorstDecile: '-0.09'"),
  },
  {
    name: 'WORST_DECILE_USES_FLOOR_INSTEAD_OF_CEIL',
    edits: edit(
      SUMMARY,
      'Math.ceil(sorted.length / DECILE_DIVISOR)',
      'Math.floor(sorted.length / DECILE_DIVISOR)',
    ),
  },
  {
    name: 'WORST_DECILE_USES_ROUND_INSTEAD_OF_CEIL',
    edits: edit(
      SUMMARY,
      'Math.ceil(sorted.length / DECILE_DIVISOR)',
      'Math.round(sorted.length / DECILE_DIVISOR)',
    ),
  },
  {
    name: 'EVEN_MEDIAN_TAKES_THE_UPPER_MIDDLE',
    edits: edit(SUMMARY, 'lower.plus(upper).dividedBy(TWO)', 'upper'),
  },
  {
    name: 'ZERO_COUNTS_AS_POSITIVE',
    edits: edit(SUMMARY, 'value.greaterThan(ZERO)', 'value.greaterThanOrEqualTo(ZERO)', 2),
  },
  {
    name: 'SUMMARY_ROUNDED_HALF_UP',
    edits: edit(SUMMARY, 'EngineDecimal.ROUND_FLOOR', 'EngineDecimal.ROUND_HALF_UP'),
  },
  {
    name: 'LAST_WINDOW_DROPPED',
    edits: edit(WINDOWS, 'start <= last;', 'start < last;'),
  },
  {
    name: 'FIRST_WINDOW_SKIPPED',
    edits: edit(
      WINDOWS,
      'let start = findFirstDecidedIndex(signals);',
      'let start = findFirstDecidedIndex(signals) + 1;',
    ),
  },
  {
    name: 'RETURN_IS_THE_RATIO_NOT_THE_GAIN',
    edits: edit(WINDOWS, '.minus(ONE)', ''),
  },
  {
    name: 'HORIZON_ENDS_ONE_CANDLE_EARLY',
    edits: edit(WINDOWS, 'horizonCandles - 1;', 'horizonCandles - 2;'),
  },
  {
    name: 'BENCHMARK_STARTS_ONE_CANDLE_LATE',
    edits: edit(WINDOWS, 'windowStart: start }', 'windowStart: start + 1 }'),
  },
  {
    name: 'BENCHMARK_RETURN_IS_THE_STRATEGY_RETURN',
    edits: edit(
      WINDOWS,
      'toReturn(benchmark(finalOffset).equity, initial)',
      'toReturn(pathAt(start)(finalOffset).equity, initial)',
    ),
  },
];

describe('mutantes dos prazos', () => {
  const verdicts = new Map<string, HorizonMutantVerdict>();

  beforeAll(async () => {
    const queue = [CONTROL, ...MUTANTS];
    const worker = async (): Promise<void> => {
      for (let next = queue.shift(); next !== undefined; next = queue.shift()) {
        verdicts.set(next.name, await runHorizonMutant(next, HORIZON_FULL_JUDGE_TEST_FILES));
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
