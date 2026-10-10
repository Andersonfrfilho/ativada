// Copyright (c) 2026 Ada Technology. All rights reserved.
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';

import {
  runMutant,
  type MetricsSourceEdit,
  type MetricsSourceMutant,
  type MutantVerdict,
} from './fixtures/strategy-engine/metrics/metrics-mutation.fixture.js';
import { removeMutants } from './fixtures/strategy-engine/signal/signal-mutation.fixture.js';

const MUTANT_TIMEOUT_MILLISECONDS = 300_000;
const PARALLEL_MUTANTS = 4;
const CONTROL: MetricsSourceMutant = { name: 'CONTROL', edits: [] };
const STATISTICS = 'metrics/period-statistics.ts';
const RISK = 'metrics/risk-ratios.ts';
const DRAWDOWN = 'metrics/drawdown.ts';
const RETURNS = 'metrics/return-metrics.ts';
const CONSTANTS = 'metrics/metrics.constant.ts';
const TOTALS = 'metrics/trade-totals.ts';
const RATIOS = 'metrics/trade-ratios.ts';
const EXPOSURE = 'metrics/exposure.ts';
const PEAK_TOUCH = 'point.equity.greaterThanOrEqualTo(peakValue)';
const ANNUALIZATION_LIMIT = 'elapsedMilliseconds < MINIMUM_ANNUALIZATION_PERIOD_MILLISECONDS';

function edit(file: string, find: string, replace: string, occurrences = 1): MetricsSourceEdit[] {
  return [{ file, find, replace, occurrences }];
}

const MUTANTS: readonly MetricsSourceMutant[] = [
  {
    name: 'SHARPE_DEVIATION_WITH_N',
    edits: edit(
      STATISTICS,
      'squares.dividedBy(values.length - 1).sqrt()',
      'squares.dividedBy(values.length).sqrt()',
    ),
  },
  {
    name: 'SORTINO_ONLY_NEGATIVE_PERIODS',
    edits: edit(
      STATISTICS,
      'return squares.dividedBy(values.length).sqrt();',
      'return squares.dividedBy(Math.max(1, values.filter((value) => value.isNegative()).length)).sqrt();',
    ),
  },
  {
    name: 'SHARPE_WITHOUT_THE_EXACT_ZERO_TEST',
    edits: edit(STATISTICS, 'if (areAllEqual(values)) return ZERO;', ''),
  },
  {
    name: 'YEAR_OF_365_DAYS',
    edits: edit(CONSTANTS, '= 31_557_600_000;', '= 31_536_000_000;'),
  },
  {
    name: 'PERIODS_PER_YEAR_NOT_ROOTED',
    edits: edit(
      RISK,
      'computePeriodsPerYear(params.run.timeframeMilliseconds).sqrt()',
      'computePeriodsPerYear(params.run.timeframeMilliseconds)',
    ),
  },
  {
    name: 'ANNUALIZATION_FACTOR_DROPPED',
    edits: edit(RISK, '.times(params.annualization)', '', 2),
  },
  {
    name: 'DRAWDOWN_AT_LOW_USES_THE_CLOSE',
    edits: edit(DRAWDOWN, '(point) => point.low', '(point) => point.equity'),
  },
  {
    name: 'PEAK_TAKEN_FROM_THE_LOW',
    edits: [
      ...edit(DRAWDOWN, PEAK_TOUCH, 'point.low.greaterThanOrEqualTo(peakValue)'),
      ...edit(DRAWDOWN, 'peakValue = point.equity;', 'peakValue = point.low;'),
    ],
  },
  {
    name: 'DRAWDOWN_TIE_KEEPS_THE_NEWEST',
    edits: edit(
      DRAWDOWN,
      'depth.greaterThan(deepest?.depth ?? ZERO)',
      'depth.greaterThanOrEqualTo(deepest?.depth ?? ZERO)',
    ),
  },
  {
    name: 'PEAK_KEEPS_THE_FIRST_TOUCH',
    edits: edit(DRAWDOWN, PEAK_TOUCH, 'point.equity.greaterThan(peakValue)'),
  },
  {
    name: 'RECOVERY_NEEDS_A_NEW_HIGH',
    edits: edit(
      DRAWDOWN,
      '.findIndex((point) => point.equity.greaterThanOrEqualTo(candidate.peakValue))',
      '.findIndex((point) => point.equity.greaterThan(candidate.peakValue))',
    ),
  },
  {
    name: 'DRAWDOWN_DURATION_ENDS_AT_THE_TROUGH',
    edits: edit(
      DRAWDOWN,
      'const endIndex = recoveryIndex ?? points.length - 1;',
      'const endIndex = candidate.troughIndex;',
    ),
  },
  {
    name: 'PROFIT_FACTOR_INVERTED',
    edits: edit(
      RATIOS,
      'totals.grossProfit.dividedBy(totals.grossLoss)',
      'totals.grossLoss.dividedBy(totals.grossProfit)',
    ),
  },
  {
    name: 'WIN_RATE_COUNTS_THE_OPEN_POSITION',
    edits: edit(
      'metrics/trade-metrics.ts',
      'const totals = sumTrades(trades);',
      'const base = sumTrades(trades);\n  const totals = { ...base, count: base.count + (openPosition === null ? 0 : 1) };',
    ),
  },
  {
    name: 'FEES_WITHOUT_THE_ENTRY',
    edits: edit(
      TOTALS,
      '(sum, trade) => sum.plus(trade.entryFee).plus(trade.exitFee),',
      '(sum, trade) => sum.plus(trade.exitFee),',
    ),
  },
  {
    name: 'FEES_WITHOUT_THE_OPEN_POSITION',
    edits: edit(
      TOTALS,
      'return closedFees.plus(openPosition?.entryFee ?? ZERO);',
      'return closedFees;',
    ),
  },
  {
    name: 'EXPOSURE_COUNTS_THE_EXIT_CANDLE',
    edits: edit(
      EXPOSURE,
      '(intervals[cursor]?.until ?? 0) <= point.time',
      '(intervals[cursor]?.until ?? 0) < point.time',
    ),
  },
  {
    name: 'EXPOSURE_IGNORES_THE_OPEN_POSITION',
    edits: edit(EXPOSURE, 'if (params.openPosition !== null) {', 'if (false) {'),
  },
  {
    name: 'ANNUALIZES_SHORT_PERIODS',
    edits: edit(RETURNS, `if (${ANNUALIZATION_LIMIT}) {`, 'if (false) {'),
  },
  {
    name: 'ANNUALIZATION_THRESHOLD_EXCLUSIVE',
    edits: edit(
      RETURNS,
      ANNUALIZATION_LIMIT,
      'elapsedMilliseconds <= MINIMUM_ANNUALIZATION_PERIOD_MILLISECONDS',
    ),
  },
  {
    name: 'TRADES_PER_YEAR_FOR_SHORT_PERIODS',
    edits: edit(EXPOSURE, `if (params.${ANNUALIZATION_LIMIT}) {`, 'if (false) {'),
  },
  {
    name: 'ANNUALIZATION_THRESHOLD_OF_29_DAYS',
    edits: edit(CONSTANTS, '= 30 * MILLISECONDS_PER_DAY;', '= 29 * MILLISECONDS_PER_DAY;'),
  },
  {
    name: 'EXCESS_RETURN_REVERSED',
    edits: edit(RETURNS, 'ratio.minus(benchmarkRatio)', 'benchmarkRatio.minus(ratio)'),
  },
  {
    name: 'BENCHMARK_FROM_THE_EQUITY',
    edits: edit(RETURNS, 'last.benchmark.dividedBy(initial)', 'last.equity.dividedBy(initial)'),
  },
  {
    name: 'LOSS_STREAK_COUNTS_BREAKEVEN',
    edits: edit(
      TOTALS,
      'trade.netProfit.lessThan(ZERO) ? current + 1 : 0',
      'trade.netProfit.greaterThan(ZERO) ? 0 : current + 1',
    ),
  },
  {
    name: 'LOSS_STREAK_IS_THE_LAST_STREAK',
    edits: edit(TOTALS, 'longest = Math.max(longest, current);', 'longest = current;'),
  },
  {
    name: 'GROSS_LOSS_KEEPS_THE_SIGN',
    edits: edit(
      TOTALS,
      'losers.reduce((sum, trade) => sum.minus(trade.netProfit), ZERO)',
      'losers.reduce((sum, trade) => sum.plus(trade.netProfit), ZERO)',
    ),
  },
  {
    name: 'BREAKEVEN_COUNTS_AS_A_WIN',
    edits: edit(
      TOTALS,
      'trades.filter((trade) => trade.netProfit.greaterThan(ZERO))',
      'trades.filter((trade) => trade.netProfit.greaterThanOrEqualTo(ZERO))',
    ),
  },
  {
    name: 'EXPECTANCY_IGNORES_THE_LOSS_SIDE',
    edits: edit(
      RATIOS,
      'const lossPart = averages.loss?.times(lossRate) ?? ZERO;',
      'const lossPart = ZERO;',
    ),
  },
  {
    name: 'AVERAGE_LOSS_OVER_ALL_TRADES',
    edits: edit(
      RATIOS,
      'totals.grossLoss.dividedBy(totals.losses)',
      'totals.grossLoss.dividedBy(totals.count)',
    ),
  },
  {
    name: 'RECONCILIATION_IGNORES_THE_UNREALIZED',
    edits: edit(
      'metrics/reconcile-run-metrics.ts',
      'const accounted = realized.plus(unrealized);',
      'const accounted = realized;',
    ),
  },
];

describe('metrics: the contract rejects every mutant of the production source', () => {
  const verdicts = new Map<string, MutantVerdict>();

  // Cada mutante é um processo `bun test` à parte; quatro de cada vez mantêm a suíte rápida.
  beforeAll(async () => {
    const queue = [CONTROL, ...MUTANTS];
    const worker = async (): Promise<void> => {
      for (let next = queue.shift(); next !== undefined; next = queue.shift()) {
        verdicts.set(next.name, await runMutant(next));
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
    expect(verdict?.hasLoadError).toBe(false);
    expect(verdict?.exitCode).not.toBe(0);
    expect(verdict?.failedTests ?? 0).toBeGreaterThan(0);
  });

  test('there are at least 15 mutants and each has a distinct name', () => {
    expect(MUTANTS.length).toBeGreaterThanOrEqual(15);
    expect(new Set(MUTANTS.map((mutant) => mutant.name)).size).toBe(MUTANTS.length);
  });

  test('the mutants the architect listed are all there', () => {
    const names = MUTANTS.map((mutant) => mutant.name);
    for (const mandatory of [
      'SHARPE_DEVIATION_WITH_N',
      'SORTINO_ONLY_NEGATIVE_PERIODS',
      'YEAR_OF_365_DAYS',
      'DRAWDOWN_AT_LOW_USES_THE_CLOSE',
      'PEAK_TAKEN_FROM_THE_LOW',
      'PROFIT_FACTOR_INVERTED',
      'WIN_RATE_COUNTS_THE_OPEN_POSITION',
      'FEES_WITHOUT_THE_ENTRY',
      'ANNUALIZES_SHORT_PERIODS',
    ]) {
      expect(names).toContain(mandatory);
    }
  });
});
