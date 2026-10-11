// Copyright (c) 2026 Ada Technology. All rights reserved.
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';

import { removeMutants } from './fixtures/strategy-engine/signal/signal-mutation.fixture.js';
import {
  runSurvivalMutant,
  type SurvivalMutantVerdict,
  type SurvivalSourceEdit,
  type SurvivalSourceMutant,
} from './fixtures/strategy-engine/survival/survival-mutation.fixture.js';

const MUTANT_TIMEOUT_MILLISECONDS = 300_000;
const PARALLEL_MUTANTS = 4;
const CONTROL: SurvivalSourceMutant = { name: 'CONTROL', edits: [] };
const COMPUTE = 'survival/compute-balance-survival.ts';
const LEVELS = 'survival/survival-levels.ts';
const SCAN = 'survival/survival-scan.ts';
const INPUT = 'survival/survival-input.ts';
const SETTINGS = 'survival/survival-settings.schema.ts';

function edit(file: string, find: string, replace: string, occurrences = 1): SurvivalSourceEdit[] {
  return [{ file, find, replace, occurrences }];
}

const MUTANTS: readonly SurvivalSourceMutant[] = [
  {
    name: 'FLOOR_LEVEL_ROUNDED_DOWN',
    edits: edit(
      LEVELS,
      'moneyUp(input.initial.times(input.floorRate))',
      'input.initial.times(input.floorRate).toDecimalPlaces(8, 3)',
    ),
  },
  {
    name: 'TARGET_LEVEL_ROUNDED_DOWN',
    edits: edit(
      LEVELS,
      'moneyUp(input.initial.times(input.doubleRate))',
      'input.initial.times(input.doubleRate).toDecimalPlaces(8, 3)',
    ),
  },
  {
    name: 'FLOOR_NEEDS_TO_GO_STRICTLY_BELOW',
    edits: edit(
      SCAN,
      'point.equityAtLow.lte(params.floorLevel)',
      'point.equityAtLow.lt(params.floorLevel)',
    ),
  },
  {
    name: 'FLOOR_LOOKS_AT_THE_CLOSE',
    edits: edit(
      SCAN,
      'point.equityAtLow.lte(params.floorLevel)',
      'point.equity.lte(params.floorLevel)',
    ),
  },
  {
    name: 'DOUBLE_NEEDS_TO_GO_STRICTLY_ABOVE',
    edits: edit(
      SCAN,
      'point.equity.gte(params.targetLevel)',
      'point.equity.gt(params.targetLevel)',
    ),
  },
  {
    name: 'DOUBLE_LOOKS_AT_THE_LOW',
    edits: edit(
      SCAN,
      'point.equity.gte(params.targetLevel)',
      'point.equityAtLow.gte(params.targetLevel)',
    ),
  },
  {
    name: 'FLOOR_KEEPS_THE_LAST_TIME',
    edits: edit(SCAN, 'floorPoint === undefined && ', ''),
  },
  {
    name: 'DOUBLE_KEEPS_THE_LAST_TIME',
    edits: edit(SCAN, 'doublePoint === undefined && ', ''),
  },
  {
    name: 'WARM_UP_COUNTS',
    edits: edit(SCAN, '    if (point.candleOpenTime < params.startTime) continue;\n', ''),
  },
  {
    name: 'LOWEST_LOOKS_AT_THE_CLOSE',
    edits: edit(
      SCAN,
      'if (lowest === undefined || point.equityAtLow.lt(lowest)) lowest = point.equityAtLow;',
      'if (lowest === undefined || point.equity.lt(lowest)) lowest = point.equity;',
    ),
  },
  {
    name: 'HIGHEST_LOOKS_AT_THE_LOW',
    edits: edit(
      SCAN,
      'if (highest === undefined || point.equity.gt(highest)) highest = point.equity;',
      'if (highest === undefined || point.equityAtLow.gt(highest)) highest = point.equityAtLow;',
    ),
  },
  {
    name: 'ELAPSED_STOPS_AT_THE_OPEN',
    edits: edit(
      COMPUTE,
      ': reachedPoint.candleOpenTime + params.durationMilliseconds - params.startTime,',
      ': reachedPoint.candleOpenTime - params.startTime,',
    ),
  },
  {
    name: 'OBSERVED_TIME_STOPS_AT_THE_OPEN',
    edits: edit(
      COMPUTE,
      'last === undefined ? 0 : last.candleOpenTime + durationMilliseconds - startTime',
      'last === undefined ? 0 : last.candleOpenTime - startTime',
    ),
  },
  {
    name: 'FLOOR_PROGRESS_ROUNDED_DOWN',
    edits: edit(COMPUTE, 'EngineDecimal.ROUND_CEIL', 'EngineDecimal.ROUND_FLOOR'),
  },
  {
    name: 'DOUBLE_PROGRESS_ROUNDED_UP',
    edits: edit(COMPUTE, 'EngineDecimal.ROUND_FLOOR', 'EngineDecimal.ROUND_CEIL'),
  },
  {
    name: 'UNREACHED_PROGRESS_REACHES_ONE',
    edits: edit(COMPUTE, 'EngineDecimal.min(consumed, LARGEST_UNREACHED_PROGRESS)', 'consumed'),
  },
  {
    name: 'REACHED_PROGRESS_NOT_COMPLETE',
    edits: edit(
      COMPUTE,
      'reachedPoint === undefined ? params.progress : SURVIVAL_PROGRESS_COMPLETE',
      'params.progress',
    ),
  },
  {
    name: 'POINTS_OUT_OF_ORDER_ACCEPTED',
    edits: edit(INPUT, 'if (parsed.candleOpenTime <= previous) {', 'if (false as boolean) {'),
  },
  {
    name: 'NEGATIVE_AMOUNT_ACCEPTED',
    edits: edit(INPUT, '/^\\d{1,30}(\\.\\d{1,30})?$/', '/^-?\\d{1,30}(\\.\\d{1,30})?$/'),
  },
  {
    name: 'ZERO_INITIAL_BALANCE_ACCEPTED',
    edits: edit(INPUT, 'if (!initial.greaterThan(0)) {', 'if (false as boolean) {'),
  },
  {
    name: 'FLOOR_RATE_ONE_ACCEPTED',
    edits: edit(SETTINGS, '  isMaximumExclusive: true,\n', ''),
  },
  {
    name: 'DOUBLE_RATE_ONE_ACCEPTED',
    edits: edit(
      SETTINGS,
      '  maximum: MAXIMUM_SURVIVAL_DOUBLE_RATE,\n  isMinimumExclusive: true,\n',
      '  maximum: MAXIMUM_SURVIVAL_DOUBLE_RATE,\n',
    ),
  },
  {
    name: 'UNKNOWN_SETTING_ACCEPTED',
    edits: edit(SETTINGS, 'z.strictObject({', 'z.object({'),
  },
];

describe('mutantes da sobrevivência do saldo', () => {
  const verdicts = new Map<string, SurvivalMutantVerdict>();

  beforeAll(async () => {
    const queue = [CONTROL, ...MUTANTS];
    const worker = async (): Promise<void> => {
      for (let next = queue.shift(); next !== undefined; next = queue.shift()) {
        verdicts.set(next.name, await runSurvivalMutant(next));
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
