// Copyright (c) 2026 Ada Technology. All rights reserved.
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';

import {
  ENGINE_MUTANT_TARGET,
  removeMutantCopies,
  runSourceMutant,
  type MutantVerdict,
  type SourceEdit,
  type SourceMutant,
} from './fixtures/walk-forward/walk-forward-mutation.fixture.js';

const MUTANT_TIMEOUT_MILLISECONDS = 600_000;
const PARALLEL_MUTANTS = 4;
const CONTROL: SourceMutant = { name: 'CONTROL', edits: [] };
const PLANNER = 'walk-forward/plan-walk-forward-windows.ts';
const CALENDAR = 'walk-forward/utc-calendar.ts';
const SELECTION = 'walk-forward/select-best-parameters.ts';
const EXPANSION = 'walk-forward/expand-walk-forward-grid.ts';
const GRID_SCHEMA = 'walk-forward/walk-forward-grid.schema.ts';
const CONSTANTS = 'walk-forward/walk-forward.constant.ts';
const CHAIN = 'walk-forward/chain-window-result.ts';
const OVERFITTING = 'walk-forward/detect-overfitting.ts';
const CONCATENATION = 'walk-forward/concatenate-out-of-sample.ts';

function edit(file: string, find: string, replace: string, occurrences = 1): SourceEdit[] {
  return [{ file, find, replace, occurrences }];
}

const MUTANTS: readonly SourceMutant[] = [
  {
    name: 'TEST_WINDOWS_OVERLAP',
    edits: edit(
      PLANNER,
      'const offset = index * plan.stepMonths;',
      'const offset = index * (plan.stepMonths - 1);',
    ),
  },
  {
    name: 'OVERLAPPING_STEP_ACCEPTED',
    edits: edit(PLANNER, 'if (stepMonths < testMonths)', 'if (stepMonths < 0)'),
  },
  {
    name: 'TRAIN_USES_TEST_DATA',
    edits: edit(PLANNER, 'trainEnd: testStart,', 'trainEnd: addUtcMonths(testStart, 1),'),
  },
  {
    name: 'LAST_TEST_MAY_OVERRUN_THE_PERIOD',
    edits: edit(
      PLANNER,
      'if (window.testEnd > plan.end) break;',
      'if (window.testEnd > plan.end + 5_184_000_000) break;',
    ),
  },
  {
    name: 'TWO_WINDOWS_ARE_ENOUGH',
    edits: edit(CONSTANTS, 'MIN_WALK_FORWARD_WINDOWS = 3;', 'MIN_WALK_FORWARD_WINDOWS = 2;'),
  },
  {
    name: 'LEAD_IN_AFTER_THE_START',
    edits: edit(
      PLANNER,
      'trainLeadInStart: trainStart - plan.leadInMilliseconds,',
      'trainLeadInStart: trainStart + plan.leadInMilliseconds,',
    ),
  },
  {
    name: 'MONTH_END_NOT_CLAMPED',
    edits: edit(CALENDAR, 'Math.min(day, daysInMonth(targetYear, targetMonth))', 'day'),
  },
  {
    name: 'MIN_TRADES_IGNORED',
    edits: edit(
      SELECTION,
      'candidate.trades < params.minTradesPerWindow || candidate.sharpe === null',
      'candidate.sharpe === null',
    ),
  },
  {
    name: 'UNDEFINED_SHARPE_COMPETES',
    edits: edit(
      SELECTION,
      'candidate.trades < params.minTradesPerWindow || candidate.sharpe === null',
      'candidate.trades < params.minTradesPerWindow',
    ),
  },
  {
    name: 'TIE_BREAK_PICKS_THE_LAST',
    edits: edit(
      SELECTION,
      'return challenger.candidate.combinationIndex < current.candidate.combinationIndex;',
      'return true;',
    ),
  },
  {
    name: 'TIE_BREAK_PREFERS_FEWER_TRADES',
    edits: edit(
      SELECTION,
      'return challenger.candidate.trades > current.candidate.trades;',
      'return challenger.candidate.trades < current.candidate.trades;',
    ),
  },
  {
    name: 'TIE_BREAK_PREFERS_THE_DEEPER_DRAWDOWN',
    edits: edit(
      SELECTION,
      'return challenger.drawdown.lessThan(current.drawdown);',
      'return challenger.drawdown.greaterThan(current.drawdown);',
    ),
  },
  {
    name: 'LEAST_BAD_IS_CHOSEN_WHEN_NONE_IS_ELIGIBLE',
    edits: edit(
      SELECTION,
      'if (first === undefined) {',
      'if (first === undefined && params.candidates.length > 0) {\n    const [fallback] = params.candidates;\n    if (fallback !== undefined) return { status: WINDOW_STATUS.OK, best: fallback, eligibleCount: 0 };\n  }\n  if (first === undefined) {',
    ),
  },
  {
    name: 'CEILING_COUNTS_THE_INVALID_COMBINATIONS',
    edits: edit(
      EXPANSION,
      'if (valid.length > MAX_WALK_FORWARD_COMBINATIONS) {',
      'if (rawCombinations > MAX_WALK_FORWARD_COMBINATIONS) {',
    ),
  },
  {
    name: 'CEILING_OFF_BY_ONE',
    edits: edit(
      EXPANSION,
      'if (valid.length > MAX_WALK_FORWARD_COMBINATIONS) {',
      'if (valid.length >= MAX_WALK_FORWARD_COMBINATIONS) {',
    ),
  },
  {
    name: 'GRID_OUTSIDE_THE_CATALOG_ACCEPTED',
    edits: edit(
      GRID_SCHEMA,
      '.refine((path) => parseTunablePath(path) !== undefined,',
      '.refine(() => true,',
    ),
  },
  {
    name: 'INVALID_COMBINATIONS_KEPT',
    edits: edit(
      EXPANSION,
      'if (derived.isValid) valid.push({ assignment, config: derived.config });',
      'valid.push({ assignment, config: derived.isValid ? derived.config : base });',
    ),
  },
  {
    name: 'OVERFITTING_THRESHOLD_100_PERCENT',
    edits: edit(
      CONSTANTS,
      "OVERFITTING_DEGRADATION_LIMIT = '0.5';",
      "OVERFITTING_DEGRADATION_LIMIT = '1';",
    ),
  },
  {
    name: 'OVERFITTING_BOUNDARY_INCLUSIVE',
    edits: edit(OVERFITTING, 'if (out.lessThan(limit))', 'if (out.lessThanOrEqualTo(limit))'),
  },
  {
    name: 'OVERFITTING_IGNORES_THE_ELIGIBLE_WINDOWS',
    edits: edit(
      OVERFITTING,
      'new EngineDecimal(params.eligibleWindows).lessThan(minimum)',
      'false',
    ),
  },
  {
    name: 'OVERFITTING_MEAN_NOT_WEIGHTED',
    edits: edit(OVERFITTING, '.times(window.weight)),', '),'),
  },
  {
    name: 'OVERFITTING_COUNTS_INELIGIBLE_WINDOWS_IN_THE_MEAN',
    edits: edit(
      OVERFITTING,
      'windows.filter((window) => window.isEligible && window.inSampleSharpe !== null)',
      'windows.filter((window) => window.inSampleSharpe !== null)',
    ),
  },
  {
    name: 'CHAIN_RESTARTS_FROM_THE_INITIAL_BALANCE',
    edits: edit(
      CHAIN,
      'const scale = new EngineDecimal(carried.equity)',
      'const scale = new EngineDecimal(run.initialBalance)',
    ),
  },
  {
    name: 'CHAIN_SCALES_ONLY_THE_CLOSE',
    edits: edit(
      CHAIN,
      'equityAtLow: scaleValue(point.equityAtLow, scale),',
      'equityAtLow: point.equityAtLow,',
    ),
  },
  {
    name: 'BENCHMARK_REPAYS_THE_ENTRY_EVERY_WINDOW',
    edits: edit(
      CHAIN,
      'const isRebased = result.index !== FIRST_WINDOW_INDEX && first.greaterThan(ZERO);',
      'const isRebased = false;',
    ),
  },
  {
    name: 'OPEN_POSITION_AT_WINDOW_END_IS_DROPPED',
    edits: edit(CHAIN, 'if (openPosition === null || last === undefined) return [];', 'return [];'),
  },
  {
    name: 'TRADES_NOT_SCALED',
    edits: edit(
      CHAIN,
      'netProfit: scaleValue(trade.netProfit, scale),',
      'netProfit: trade.netProfit,',
    ),
  },
  {
    name: 'REPORT_DROPS_THE_LATER_WINDOWS',
    edits: edit(
      CONCATENATION,
      'params.windows.flatMap((window) => window.equityPoints);',
      'params.windows.slice(0, 1).flatMap((window) => window.equityPoints);',
    ),
  },
];

describe('walk-forward (domínio): o contrato reprova cada mutante do código de produção', () => {
  const verdicts = new Map<string, MutantVerdict>();

  // Cada mutante é um processo `bun test` à parte; quatro de cada vez mantêm a suíte rápida.
  beforeAll(async () => {
    const queue = [CONTROL, ...MUTANTS];
    const worker = async (): Promise<void> => {
      for (let next = queue.shift(); next !== undefined; next = queue.shift()) {
        verdicts.set(next.name, await runSourceMutant(ENGINE_MUTANT_TARGET, next));
      }
    };
    await Promise.all(Array.from({ length: PARALLEL_MUTANTS }, worker));
  }, MUTANT_TIMEOUT_MILLISECONDS);

  afterAll(() => removeMutantCopies(ENGINE_MUTANT_TARGET));

  test('a cópia sem edição passa nos mesmos testes: o arnês é sólido', () => {
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

  test('os nomes são distintos', () => {
    expect(new Set(MUTANTS.map((mutant) => mutant.name)).size).toBe(MUTANTS.length);
  });
});
