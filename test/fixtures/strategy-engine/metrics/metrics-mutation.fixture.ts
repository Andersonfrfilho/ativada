// Copyright (c) 2026 Ada Technology. All rights reserved.
import { cp } from 'node:fs/promises';

import { MUTANT_ROOT } from '../signal/signal-mutation.fixture.js';
import { MUTANT_SOURCE_VARIABLE, PROPERTY_SERIES_VARIABLE } from './metrics-api.fixture.js';

const REPOSITORY_ROOT = new URL('../../../../', import.meta.url).pathname;
const SOURCE_DIRECTORY = `${REPOSITORY_ROOT}packages/strategy-engine/src`;
const MUTANT_PROPERTY_SERIES = '150';
// Os testes de métrica que reprovam o mutante: contas à mão, bordas e propriedades (o dourado fica de fora).
export const JUDGE_TEST_FILES: readonly string[] = [
  'test/metrics-return-risk.contract.test.ts',
  'test/metrics-drawdown.contract.test.ts',
  'test/metrics-trades.contract.test.ts',
  'test/metrics-properties.contract.test.ts',
];

export type MetricsSourceEdit = {
  readonly file: string;
  readonly find: string;
  readonly replace: string;
  readonly occurrences?: number;
};

export type MetricsSourceMutant = {
  readonly name: string;
  readonly edits: readonly MetricsSourceEdit[];
};

export type MutantVerdict = {
  readonly exitCode: number;
  readonly failedTests: number;
  readonly hasLoadError: boolean;
};

async function applyEdit(directory: string, name: string, edit: MetricsSourceEdit): Promise<void> {
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

// Cópia do `src` com as edições; os testes de métrica rodam contra ela num processo à parte.
export async function runMutant(mutant: MetricsSourceMutant): Promise<MutantVerdict> {
  const directory = `${MUTANT_ROOT}/metrics-${mutant.name.toLowerCase()}`;
  await cp(SOURCE_DIRECTORY, directory, { recursive: true });
  for (const edit of mutant.edits) await applyEdit(directory, mutant.name, edit);
  const child = Bun.spawn([process.execPath, 'test', ...JUDGE_TEST_FILES], {
    cwd: REPOSITORY_ROOT,
    env: {
      PATH: Bun.env.PATH ?? '',
      HOME: Bun.env.HOME ?? '',
      [MUTANT_SOURCE_VARIABLE]: directory,
      [PROPERTY_SERIES_VARIABLE]: MUTANT_PROPERTY_SERIES,
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
