// Copyright (c) 2026 Ada Technology. All rights reserved.
import { cp } from 'node:fs/promises';

import { MUTANT_ROOT } from '../signal/signal-mutation.fixture.js';
import { SURVIVAL_MUTANT_VARIABLE } from './survival-api.fixture.js';

const REPOSITORY_ROOT = new URL('../../../../', import.meta.url).pathname;
const SOURCE_DIRECTORY = `${REPOSITORY_ROOT}packages/strategy-engine/src`;
// O teste que reprova o mutante: as contas à mão, as bordas, a validação e o diferencial contra o oráculo.
export const SURVIVAL_JUDGE_TEST_FILES: readonly string[] = [
  'test/balance-survival.contract.test.ts',
];

export type SurvivalSourceEdit = {
  readonly file: string;
  readonly find: string;
  readonly replace: string;
  readonly occurrences?: number;
};

export type SurvivalSourceMutant = {
  readonly name: string;
  readonly edits: readonly SurvivalSourceEdit[];
};

export type SurvivalMutantVerdict = {
  readonly exitCode: number;
  readonly failedTests: number;
  readonly hasLoadError: boolean;
  readonly problem?: string;
};

async function applyEdit(directory: string, name: string, edit: SurvivalSourceEdit): Promise<void> {
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

// Cópia do `src` com as edições; os testes de sobrevivência rodam contra ela num processo à parte.
export async function runSurvivalMutant(
  mutant: SurvivalSourceMutant,
): Promise<SurvivalMutantVerdict> {
  const directory = `${MUTANT_ROOT}/survival-${mutant.name.toLowerCase()}`;
  await cp(SOURCE_DIRECTORY, directory, { recursive: true });
  try {
    for (const edit of mutant.edits) await applyEdit(directory, mutant.name, edit);
  } catch (error: unknown) {
    const problem = error instanceof Error ? error.message : 'edição inválida';
    return { exitCode: -1, failedTests: 0, hasLoadError: false, problem };
  }
  const child = Bun.spawn([process.execPath, 'test', ...SURVIVAL_JUDGE_TEST_FILES], {
    cwd: REPOSITORY_ROOT,
    env: {
      PATH: Bun.env.PATH ?? '',
      HOME: Bun.env.HOME ?? '',
      [SURVIVAL_MUTANT_VARIABLE]: directory,
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
