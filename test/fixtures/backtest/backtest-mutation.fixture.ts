// Copyright (c) 2026 Ada Technology. All rights reserved.
import { cp, rm } from 'node:fs/promises';

import { BACKTEST_MUTANT_VARIABLE } from './backtest-api.fixture.js';

const REPOSITORY_ROOT = new URL('../../../', import.meta.url).pathname;
const SOURCE_DIRECTORY = `${REPOSITORY_ROOT}apps/api-cryptoada/src/backtest`;
// Dentro da app: é de lá que `@cryptoada/*` e `zod` se resolvem, como no módulo de produção.
export const BACKTEST_MUTANT_ROOT = `${REPOSITORY_ROOT}apps/api-cryptoada/.mutants`;

// Os testes que reprovam o mutante: caso de uso, falhas, continuidade e a thread.
export const BACKTEST_JUDGE_TEST_FILES: readonly string[] = [
  'test/backtest-use-case.contract.test.ts',
  'test/backtest-failures.contract.test.ts',
  'test/backtest-continuity.contract.test.ts',
  'test/backtest-thread.contract.test.ts',
];

export type BacktestSourceEdit = {
  readonly file: string;
  readonly find: string;
  readonly replace: string;
  readonly occurrences?: number;
};

export type BacktestSourceMutant = {
  readonly name: string;
  readonly edits: readonly BacktestSourceEdit[];
};

export type BacktestMutantVerdict = {
  readonly exitCode: number;
  readonly failedTests: number;
  readonly hasLoadError: boolean;
};

async function applyEdit(directory: string, name: string, edit: BacktestSourceEdit): Promise<void> {
  const path = `${directory}/${edit.file}`;
  const text = await Bun.file(path).text();
  const found = text.split(edit.find).length - 1;
  const expected = edit.occurrences ?? 1;
  if (found !== expected) {
    throw new Error(`Mutante ${name}: "${edit.find}" aparece ${found}x em ${edit.file}.`);
  }
  await Bun.write(
    path,
    text.replaceAll(edit.find, () => edit.replace),
  );
}

// Cópia do módulo com as edições; os testes do backtest rodam contra ela num processo à parte.
export async function runBacktestMutant(
  mutant: BacktestSourceMutant,
): Promise<BacktestMutantVerdict> {
  const directory = `${BACKTEST_MUTANT_ROOT}/${mutant.name.toLowerCase()}`;
  await cp(SOURCE_DIRECTORY, directory, { recursive: true });
  for (const edit of mutant.edits) await applyEdit(directory, mutant.name, edit);
  const child = Bun.spawn([process.execPath, 'test', ...BACKTEST_JUDGE_TEST_FILES], {
    cwd: REPOSITORY_ROOT,
    env: {
      PATH: Bun.env.PATH ?? '',
      HOME: Bun.env.HOME ?? '',
      [BACKTEST_MUTANT_VARIABLE]: directory,
    },
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const [output, errors, exitCode] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  const report = `${output}\n${errors}`;
  return {
    exitCode,
    failedTests: report.split('\n').filter((line) => line.startsWith('(fail)')).length,
    hasLoadError: report.includes('Unhandled error between tests'),
  };
}

export async function removeBacktestMutants(): Promise<void> {
  await rm(BACKTEST_MUTANT_ROOT, { recursive: true, force: true });
}
