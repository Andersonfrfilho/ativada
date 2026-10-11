// Copyright (c) 2026 Ada Technology. All rights reserved.
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';

import { removeMutants } from './fixtures/strategy-engine/signal/signal-mutation.fixture.js';
import {
  runPlanMutant,
  type PlanMutantVerdict,
  type PlanSourceEdit,
  type PlanSourceMutant,
} from './fixtures/strategy-engine/plan/plan-mutation.fixture.js';

const MUTANT_TIMEOUT_MILLISECONDS = 600_000;
const PARALLEL_MUTANTS = 4;
const CONTROL: PlanSourceMutant = { name: 'CONTROL', edits: [] };
// A busca lenta faria os testes com preços reais levarem horas: só o contrato da busca (que conta as consultas) a julga.
const SEARCH_ONLY_MUTANTS = new Set(['BOUNDARY_LINEAR_GROWTH']);
const SEARCH_ONLY = ['test/operation-plan-search.contract.test.ts'];
const BOUNDARY = 'plan/plan-boundary.ts';
const PROBE = 'plan/plan-probe.ts';
const LEVEL = 'plan/plan-level.ts';
const LEVELS = 'plan/plan-levels.ts';
const COMPUTE = 'plan/compute-operation-plan.ts';
const LATEST = 'plan/compute-latest-plan.ts';
const CONSTANT = 'plan/plan.constant.ts';

function edit(file: string, find: string, replace: string, occurrences = 1): PlanSourceEdit[] {
  return [{ file, find, replace, occurrences }];
}

const MUTANTS: readonly PlanSourceMutant[] = [
  {
    name: 'BOUNDARY_ABOVE_WITHOUT_REFINE',
    edits: edit(
      BOUNDARY,
      'return refine({ valueAt, origin, same: quietAbove, different: above });',
      'return { same: quietAbove, different: above };',
    ),
  },
  {
    name: 'BOUNDARY_BELOW_WITHOUT_REFINE',
    edits: edit(
      BOUNDARY,
      'return refine({ valueAt, origin, same: quietBelow, different: below });',
      'return { same: quietBelow, different: below };',
    ),
  },
  {
    name: 'BOUNDARY_NEVER_LOOKS_ABOVE',
    edits: edit(BOUNDARY, 'if (above > quietAbove) {', 'if (false) {'),
  },
  {
    name: 'BOUNDARY_NEVER_LOOKS_BELOW',
    edits: edit(BOUNDARY, 'if (below < quietBelow) {', 'if (false) {'),
  },
  {
    name: 'BOUNDARY_TIE_GOES_BELOW',
    edits: edit(
      BOUNDARY,
      'const above = Math.min(origin + distance, maximumIndex);\n    if (above > quietAbove) {',
      'const above = Math.min(origin + distance, maximumIndex);\n    if (above > quietAbove && !(valueAt(Math.max(origin - distance, MINIMUM_INDEX)) !== originValue)) {',
    ),
  },
  {
    name: 'BOUNDARY_MINIMUM_INDEX_ZERO',
    edits: edit(BOUNDARY, 'const MINIMUM_INDEX = 1;', 'const MINIMUM_INDEX = 0;'),
  },
  {
    name: 'BOUNDARY_LINEAR_GROWTH',
    edits: edit(BOUNDARY, 'distance *= DISTANCE_GROWTH', 'distance += 1'),
  },
  {
    name: 'BOUNDARY_FIRST_DISTANCE_TWO',
    edits: edit(BOUNDARY, 'const FIRST_DISTANCE = 1;', 'const FIRST_DISTANCE = 2;'),
  },
  {
    name: 'BOUNDARY_SWAPPED_RESULT',
    edits: edit(
      BOUNDARY,
      'return { same, different };',
      'return { same: different, different: same };',
    ),
  },
  {
    name: 'BOUNDARY_IGNORES_MAXIMUM',
    edits: edit(
      BOUNDARY,
      'const above = Math.min(origin + distance, maximumIndex);',
      'const above = origin + distance;',
    ),
  },
  {
    name: 'BOUNDARY_BISECT_KEEPS_FAR_SIDE',
    edits: edit(
      BOUNDARY,
      'if (params.valueAt(middle) === originValue) same = middle;',
      'if (params.valueAt(middle) !== originValue) same = middle;',
    ),
  },
  {
    name: 'PROBE_CANDLE_VOLUME_ZERO',
    edits: edit(PROBE, '    volume: last.volume,', "    volume: '0',"),
  },
  {
    name: 'PROBE_HIGH_IS_THE_OPEN',
    edits: edit(
      PROBE,
      'high: formatEngineDecimal(EngineDecimal.max(open, close)),',
      'high: formatEngineDecimal(open),',
    ),
  },
  {
    name: 'PROBE_LOW_IS_THE_OPEN',
    edits: edit(
      PROBE,
      'low: formatEngineDecimal(EngineDecimal.min(open, close)),',
      'low: formatEngineDecimal(open),',
    ),
  },
  {
    name: 'LEVEL_PRICE_OFF_BY_ONE_TICK',
    edits: edit(LEVEL, 'search.probe.priceOf(firing);', 'search.probe.priceOf(firing + 1);'),
  },
  {
    name: 'PROBE_DROPS_THE_SENTIMENT',
    edits: edit(PROBE, '        sentiment: params.sentiment,', '        sentiment: undefined,'),
  },
  {
    name: 'LEVEL_DISTANCE_ROUNDED_DOWN',
    edits: edit(LEVEL, 'EngineDecimal.ROUND_CEIL', 'EngineDecimal.ROUND_FLOOR'),
  },
  {
    name: 'LEVEL_TRIGGER_SWAPPED',
    edits: edit(
      LEVEL,
      'trigger: quiet < firing ? PLAN_TRIGGER.AT_OR_ABOVE : PLAN_TRIGGER.AT_OR_BELOW,',
      'trigger: quiet < firing ? PLAN_TRIGGER.AT_OR_BELOW : PLAN_TRIGGER.AT_OR_ABOVE,',
    ),
  },
  {
    name: 'LEVEL_DIRECTION_SWAPPED',
    edits: edit(
      LEVEL,
      'price.greaterThan(search.lastClose) ? PLAN_DIRECTION.ABOVE : PLAN_DIRECTION.BELOW',
      'price.greaterThan(search.lastClose) ? PLAN_DIRECTION.BELOW : PLAN_DIRECTION.ABOVE',
    ),
  },
  {
    name: 'LEVEL_ALWAYS_PICKS_THE_DIFFERENT_SIDE',
    edits: edit(
      LEVEL,
      'originFires ? transition.same : transition.different',
      'transition.different',
    ),
  },
  {
    name: 'LEVEL_UNDEFINED_TRANSITION_SWAPPED',
    edits: edit(
      LEVEL,
      'originFires ? activeLevel(search.lastClose) : UNREACHABLE_LEVEL',
      'originFires ? UNREACHABLE_LEVEL : activeLevel(search.lastClose)',
    ),
  },
  {
    name: 'LEVEL_IGNORES_THE_ACTIVE_SIGNAL',
    edits: edit(LEVEL, 'if (params.wasActive) return activeLevel(search.lastClose);', ''),
  },
  {
    name: 'LEVEL_ACTIVE_DISTANCE_NOT_ZERO',
    edits: edit(LEVEL, "    distance: '0',", "    distance: '1',"),
  },
  {
    name: 'LEVEL_RATE_OVER_THE_PRICE',
    edits: edit(LEVEL, 'distance.dividedBy(search.lastClose)', 'distance.dividedBy(price)'),
  },
  {
    name: 'LEVELS_FILL_NOT_ROUNDED_UP',
    edits: edit(
      LEVELS,
      'const entryFill = ceilToIncrement(params.entry.times(ONE.plus(slippageRate)), tickSize);',
      'const entryFill = params.entry.times(ONE.plus(slippageRate));',
    ),
  },
  {
    name: 'LEVELS_SLIPPAGE_SIGN',
    edits: edit(
      LEVELS,
      'params.entry.times(ONE.plus(slippageRate))',
      'params.entry.times(ONE.minus(slippageRate))',
    ),
  },
  {
    name: 'LEVELS_FEE_SIGN_ON_COST',
    edits: edit(
      LEVELS,
      'entryFill.times(ONE.plus(feeRate))',
      'entryFill.times(ONE.minus(feeRate))',
    ),
  },
  {
    name: 'LEVELS_SELL_FACTOR_WITHOUT_FEE',
    edits: edit(
      LEVELS,
      'ONE.minus(feeRate).times(ONE.minus(slippageRate))',
      'ONE.minus(slippageRate)',
    ),
  },
  {
    name: 'LEVELS_SELL_FACTOR_WITHOUT_SLIPPAGE',
    edits: edit(LEVELS, 'ONE.minus(feeRate).times(ONE.minus(slippageRate))', 'ONE.minus(feeRate)'),
  },
  {
    name: 'LEVELS_ROUNDED_DOWN',
    edits: edit(
      LEVELS,
      'ceilToIncrement(unitCost.times(outcomeRate).dividedBy(sellFactor), tickSize)',
      'unitCost.times(outcomeRate).dividedBy(sellFactor).toDecimalPlaces(2, EngineDecimal.ROUND_FLOOR)',
    ),
  },
  {
    name: 'LEVELS_TARGET_USES_MINUS',
    edits: edit(
      LEVELS,
      'sellPriceFor(ONE.plus(toEngineDecimal(goal.targetRate)))',
      'sellPriceFor(ONE.minus(toEngineDecimal(goal.targetRate)))',
    ),
  },
  {
    name: 'LEVELS_STOP_USES_PLUS',
    edits: edit(
      LEVELS,
      'sellPriceFor(ONE.minus(toEngineDecimal(goal.maxLossRate)))',
      'sellPriceFor(ONE.plus(toEngineDecimal(goal.maxLossRate)))',
    ),
  },
  {
    name: 'LEVELS_STOP_RATE_IS_THE_TARGET_RATE',
    edits: edit(LEVELS, 'rate: goal.maxLossRate,', 'rate: goal.targetRate,'),
  },
  {
    name: 'LEVELS_SKIPS_GOAL_VALIDATION',
    edits: edit(LEVELS, 'const goal = parseGoalSpec(params.goal);', 'const goal = params.goal;'),
  },
  {
    name: 'COMPUTE_SKIPS_GOAL_VALIDATION',
    edits: edit(COMPUTE, 'const goal = parseGoalSpec(params.goal);', 'const goal = params.goal;'),
  },
  {
    name: 'COMPUTE_ADX_REGIME_NOT_INDICATIVE',
    edits: edit(COMPUTE, 'config.regime.kind === REGIME_FILTER_KIND.ADX ||', 'false ||'),
  },
  {
    name: 'COMPUTE_OBV_NOT_INDICATIVE',
    edits: edit(COMPUTE, 'return kind === RULE_KIND.OBV_TREND;', 'return false;'),
  },
  {
    name: 'COMPUTE_SEARCH_NEVER_GOES_UP',
    edits: edit(
      COMPUTE,
      'lastClose.times(ONE.plus(PLAN_SEARCH_MAXIMUM_RATE))',
      'lastClose.times(ONE)',
    ),
  },
  {
    name: 'COMPUTE_DEADLINE_FROM_THE_CLOSE',
    edits: edit(COMPUTE, 'deadlineAt: startsAt +', 'deadlineAt: last.closeTime +'),
  },
  {
    name: 'COMPUTE_STARTS_AT_THE_CLOSE',
    edits: edit(
      COMPUTE,
      'const startsAt = last.closeTime + 1;',
      'const startsAt = last.closeTime;',
    ),
  },
  {
    name: 'COMPUTE_PROTECTION_FROM_THE_LAST_CLOSE',
    edits: edit(
      COMPUTE,
      'resolveProtection({ entryReference: buy.price, run, goal })',
      'resolveProtection({ entryReference: formatEngineDecimal(search.lastClose), run, goal })',
    ),
  },
  {
    name: 'COMPUTE_RULE_BUY_AND_EXIT_SWAPPED',
    edits: edit(
      COMPUTE,
      '      buy: levelFor(1),\n      exit: levelFor(-1),',
      '      buy: levelFor(-1),\n      exit: levelFor(1),',
    ),
  },
  {
    name: 'COMPUTE_RULE_VOTE_OF_THE_NEXT_RULE',
    edits: edit(
      COMPUTE,
      'wasActive: signal.votes[index]?.vote === wanted,',
      'wasActive: signal.votes[index + 1]?.vote === wanted,',
    ),
  },
  {
    name: 'COMPUTE_EXIT_WATCHES_THE_BUY',
    edits: edit(
      COMPUTE,
      'decision.action === SIGNAL_ACTION.SELL,',
      'decision.action === SIGNAL_ACTION.BUY,',
    ),
  },
  {
    name: 'COMPUTE_SIGNAL_SCORE_DROPPED',
    edits: edit(
      COMPUTE,
      'signal: { action: signal.action, score: signal.score },',
      "signal: { action: signal.action, score: '0' },",
    ),
  },
  {
    name: 'LATEST_SKIPS_THE_LAST_CANDLE',
    edits: edit(
      LATEST,
      'for (const [index, candle] of candles.entries()) {',
      'for (const [index, candle] of candles.slice(0, -1).entries()) {',
    ),
  },
  {
    name: 'LATEST_SENTIMENT_OF_THE_FIRST_CANDLE',
    edits: edit(
      LATEST,
      'sentiment: sentiments?.[candles.length - 1],',
      'sentiment: sentiments?.[0],',
    ),
  },
  {
    name: 'LATEST_DROPS_THE_SENTIMENT_IN_THE_REPLAY',
    edits: edit(LATEST, '      sentiment: sentiments?.[index],', '      sentiment: undefined,'),
  },
  {
    name: 'LATEST_PLANS_DURING_WARM_UP',
    edits: edit(
      LATEST,
      'if (last === undefined || signal === null) return null;',
      'if (last === undefined) return null;',
    ),
  },
  {
    name: 'CONSTANT_SEARCH_RATE_ZERO',
    edits: edit(CONSTANT, "PLAN_SEARCH_MAXIMUM_RATE = '3'", "PLAN_SEARCH_MAXIMUM_RATE = '0'"),
  },
];

describe('mutantes do plano de operação', () => {
  const verdicts = new Map<string, PlanMutantVerdict>();

  beforeAll(async () => {
    const queue = [CONTROL, ...MUTANTS];
    const worker = async (): Promise<void> => {
      for (let next = queue.shift(); next !== undefined; next = queue.shift()) {
        verdicts.set(
          next.name,
          await runPlanMutant(next, SEARCH_ONLY_MUTANTS.has(next.name) ? SEARCH_ONLY : undefined),
        );
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
