// Copyright (c) 2026 Ada Technology. All rights reserved.
import { cp } from 'node:fs/promises';

import { MUTANT_ROOT } from './signal/signal-mutation.fixture.js';

const REPOSITORY_ROOT = new URL('../../../', import.meta.url).pathname;
const SOURCE_DIRECTORY = `${REPOSITORY_ROOT}packages/strategy-engine/src`;

export type SourceEdit = {
  readonly file: string;
  readonly find: string;
  readonly replace: string;
  readonly occurrences?: number;
};

export type SourceMutantSpec = {
  readonly name: string;
  readonly edits: readonly SourceEdit[];
};

export type SourceMutantVerdict = {
  readonly exitCode: number;
  readonly failedTests: number;
  readonly hasLoadError: boolean;
  readonly problem?: string;
};

export type RunSourceMutantParams = {
  readonly mutant: SourceMutantSpec;
  // Prefixo do diretório da cópia e variável de ambiente que aponta os testes para ela.
  readonly prefix: string;
  readonly variable: string;
  readonly judgeTestFiles: readonly string[];
};

async function applyEdit(directory: string, name: string, edit: SourceEdit): Promise<void> {
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

// Cópia do `src` do motor com as edições; os testes juízes rodam contra ela num processo à parte.
export async function runSourceMutant(params: RunSourceMutantParams): Promise<SourceMutantVerdict> {
  const { mutant } = params;
  const directory = `${MUTANT_ROOT}/${params.prefix}-${mutant.name.toLowerCase()}`;
  await cp(SOURCE_DIRECTORY, directory, { recursive: true });
  try {
    for (const edit of mutant.edits) await applyEdit(directory, mutant.name, edit);
  } catch (error: unknown) {
    const problem = error instanceof Error ? error.message : 'edição inválida';
    return { exitCode: -1, failedTests: 0, hasLoadError: false, problem };
  }
  const child = Bun.spawn([process.execPath, 'test', ...params.judgeTestFiles], {
    cwd: REPOSITORY_ROOT,
    env: { PATH: Bun.env.PATH ?? '', HOME: Bun.env.HOME ?? '', [params.variable]: directory },
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
