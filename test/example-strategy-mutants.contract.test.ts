// Copyright (c) 2026 Ada Technology. All rights reserved.
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';

import { EXAMPLE_STRATEGY_MUTANT_TARGET } from './fixtures/api-routes/api-routes-mutation.fixture.js';
import {
  removeMutantCopies,
  runSourceMutant,
  type MutantVerdict,
  type SourceEdit,
  type SourceMutant,
} from './fixtures/walk-forward/walk-forward-mutation.fixture.js';

const MUTANT_TIMEOUT_MILLISECONDS = 300_000;
const PARALLEL_MUTANTS = 4;
const CONTROL: SourceMutant = { name: 'CONTROL', edits: [] };
const RESOLVER = 'strategies/example-seeding-user-resolver.ts';
const USE_CASE = 'strategies/seed-example-strategy.use-case.ts';

function edit(file: string, find: string, replace: string): SourceEdit[] {
  return [{ file, find, replace, occurrences: 1 }];
}

const MUTANTS: readonly SourceMutant[] = [
  {
    name: 'LOGIN_FAILS_WHEN_THE_SEEDING_FAILS',
    edits: edit(
      RESOLVER,
      'params.reportFailure(error);',
      'params.reportFailure(error);\n      throw error;',
    ),
  },
  {
    name: 'FAILURE_IS_REMEMBERED_AS_SUCCESS',
    edits: edit(
      RESOLVER,
      'params.reportFailure(error);',
      'params.reportFailure(error);\n      seeded.add(userId);',
    ),
  },
  {
    name: 'SEEDS_ON_EVERY_ACCESS',
    edits: edit(RESOLVER, 'if (seeded.has(resolution.userId)) return resolution;', ''),
  },
  {
    name: 'SIMULTANEOUS_ACCESSES_SEED_SEPARATELY',
    edits: edit(RESOLVER, 'pending.get(resolution.userId) ?? attempt(', 'attempt('),
  },
  {
    name: 'BLOCKED_AND_DELETED_ACCOUNTS_ARE_SEEDED',
    edits: edit(
      RESOLVER,
      'if (resolution.status !== USER_RESOLUTION_STATUS.ACTIVE) return resolution;',
      '',
    ),
  },
  {
    name: 'EXAMPLE_HASH_DRIFTS_FROM_THE_CONFIG',
    edits: edit(USE_CASE, 'configHash: version.configHash,', "configHash: '0'.repeat(64),"),
  },
];

describe('semeadura da estratégia de exemplo: o contrato reprova cada mutante', () => {
  const verdicts = new Map<string, MutantVerdict>();

  beforeAll(async () => {
    const queue = [CONTROL, ...MUTANTS];
    const worker = async (): Promise<void> => {
      for (let next = queue.shift(); next !== undefined; next = queue.shift()) {
        verdicts.set(next.name, await runSourceMutant(EXAMPLE_STRATEGY_MUTANT_TARGET, next));
      }
    };
    await Promise.all(Array.from({ length: PARALLEL_MUTANTS }, worker));
  }, MUTANT_TIMEOUT_MILLISECONDS);

  afterAll(() => removeMutantCopies(EXAMPLE_STRATEGY_MUTANT_TARGET));

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
