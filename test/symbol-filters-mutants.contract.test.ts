// Copyright (c) 2026 Ada Technology. All rights reserved.
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';

import {
  SYMBOL_FILTERS_API_MUTANT_TARGET,
  SYMBOL_FILTERS_PACKAGE_MUTANT_TARGET,
} from './fixtures/api-routes/api-routes-mutation.fixture.js';
import {
  removeMutantCopies,
  runSourceMutant,
  type MutantTarget,
  type MutantVerdict,
  type SourceEdit,
  type SourceMutant,
} from './fixtures/walk-forward/walk-forward-mutation.fixture.js';

const MUTANT_TIMEOUT_MILLISECONDS = 600_000;
const PARALLEL_MUTANTS = 4;
const CONTROL: SourceMutant = { name: 'CONTROL', edits: [] };
const RUN_REQUEST = 'runs/create-run-request.schema.ts';
const SERIES = 'goals/goal-evaluation-series.ts';
const TABLE = 'symbol-filters.constant.ts';
const ENVIRONMENT = 'market-environment.ts';

type TargetedMutant = SourceMutant & { readonly target: MutantTarget };

function edit(file: string, find: string, replace: string): SourceEdit[] {
  return [{ file, find, replace, occurrences: 1 }];
}

const MUTANTS: readonly TargetedMutant[] = [
  {
    name: 'RUN_SETUP_WITHOUT_THE_TABLE_SPREAD',
    target: SYMBOL_FILTERS_API_MUTANT_TARGET,
    edits: edit(RUN_REQUEST, '    ...resolveSymbolFilters(symbol),\n', ''),
  },
  {
    name: 'GOAL_SETUP_WITHOUT_THE_TABLE_SPREAD',
    target: SYMBOL_FILTERS_API_MUTANT_TARGET,
    edits: edit(SERIES, '    ...resolveSymbolFilters(symbol),\n', ''),
  },
  {
    name: 'TABLE_SPREAD_AFTER_THE_USER_VALUES',
    target: SYMBOL_FILTERS_API_MUTANT_TARGET,
    edits: edit(
      RUN_REQUEST,
      '    ...resolveSymbolFilters(symbol),\n    ...parameters,\n',
      '    ...parameters,\n    ...resolveSymbolFilters(symbol),\n',
    ),
  },
  {
    name: 'SYMBOL_WITHOUT_FILTERS_ACCEPTED',
    target: SYMBOL_FILTERS_API_MUTANT_TARGET,
    edits: edit(
      RUN_REQUEST,
      'values.includes(value) && hasKnownSymbolFilters(value)',
      'values.includes(value)',
    ),
  },
  {
    name: 'BOOT_ACCEPTS_A_SYMBOL_WITHOUT_FILTERS',
    target: SYMBOL_FILTERS_PACKAGE_MUTANT_TARGET,
    edits: edit(ENVIRONMENT, '!symbols.some(isMissingFilters)', 'true'),
  },
  {
    name: 'BTC_IN_THE_TABLE',
    target: SYMBOL_FILTERS_PACKAGE_MUTANT_TARGET,
    edits: edit(
      TABLE,
      '  DOGEUSDT: {',
      "  BTCUSDT: { tickSize: '0.01', quantityStep: '0.00001' },\n  DOGEUSDT: {",
    ),
  },
  {
    name: 'UNKNOWN_SYMBOL_FALLS_BACK_SILENTLY',
    target: SYMBOL_FILTERS_PACKAGE_MUTANT_TARGET,
    edits: edit(
      TABLE,
      'if (filters === undefined) throw new SymbolFiltersNotFoundError(symbol);',
      '',
    ),
  },
];

const TARGETS: readonly MutantTarget[] = [
  SYMBOL_FILTERS_API_MUTANT_TARGET,
  SYMBOL_FILTERS_PACKAGE_MUTANT_TARGET,
];

describe('filtros por par: os contratos reprovam cada mutante do código de produção', () => {
  const verdicts = new Map<string, MutantVerdict>();

  beforeAll(async () => {
    const queue: TargetedMutant[] = [
      ...TARGETS.map((target) => ({
        ...CONTROL,
        name: `CONTROL_${target.sourceVariable}`,
        target,
      })),
      ...MUTANTS,
    ];
    const worker = async (): Promise<void> => {
      for (let next = queue.shift(); next !== undefined; next = queue.shift()) {
        verdicts.set(next.name, await runSourceMutant(next.target, next));
      }
    };
    await Promise.all(Array.from({ length: PARALLEL_MUTANTS }, worker));
  }, MUTANT_TIMEOUT_MILLISECONDS);

  afterAll(async () => {
    await Promise.all(TARGETS.map(removeMutantCopies));
  });

  test.each(TARGETS.map((target) => [target.sourceVariable, target] as const))(
    'a cópia sem edição (%s) passa nos mesmos testes: o arnês é sólido',
    (variable) => {
      expect(verdicts.get(`CONTROL_${variable}`)).toStrictEqual({
        exitCode: 0,
        failedTests: 0,
        hasLoadError: false,
      });
    },
  );

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
