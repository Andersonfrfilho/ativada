// Copyright (c) 2026 Ada Technology. All rights reserved.
import { cp, rm } from 'node:fs/promises';

const REPOSITORY_ROOT = new URL('../../../', import.meta.url).pathname;

export type SourceEdit = {
  readonly file: string;
  readonly find: string;
  readonly replace: string;
  readonly occurrences?: number;
};

export type SourceMutant = {
  readonly name: string;
  readonly edits: readonly SourceEdit[];
};

export type MutantVerdict = {
  readonly exitCode: number;
  readonly failedTests: number;
  readonly hasLoadError: boolean;
};

// Onde fica a cópia mutada, de qual diretório sai, que testes a julgam e por qual variável eles a encontram.
export type MutantTarget = {
  readonly sourceDirectory: string;
  readonly mutantRoot: string;
  readonly directoryPrefix: string;
  readonly judgeTestFiles: readonly string[];
  readonly sourceVariable: string;
  readonly extraEnvironment?: Readonly<Record<string, string>>;
};

export const ENGINE_MUTANT_TARGET: MutantTarget = {
  sourceDirectory: `${REPOSITORY_ROOT}packages/strategy-engine/src`,
  // Dentro do pacote: é de lá que `zod` e `decimal.js` se resolvem, como no módulo de produção.
  mutantRoot: `${REPOSITORY_ROOT}packages/strategy-engine/.mutants`,
  directoryPrefix: 'walk-forward-',
  judgeTestFiles: [
    'test/walk-forward-windows.contract.test.ts',
    'test/walk-forward-grid.contract.test.ts',
    'test/walk-forward-selection.contract.test.ts',
    'test/walk-forward-out-of-sample.contract.test.ts',
    'test/walk-forward-overfitting.contract.test.ts',
  ],
  sourceVariable: 'WALK_FORWARD_ENGINE_SOURCE',
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

// Cópia do módulo com as edições; os testes que o julgam rodam contra ela num processo à parte.
export async function runSourceMutant(
  target: MutantTarget,
  mutant: SourceMutant,
): Promise<MutantVerdict> {
  const directory = `${target.mutantRoot}/${target.directoryPrefix}${mutant.name.toLowerCase()}`;
  await cp(target.sourceDirectory, directory, { recursive: true });
  for (const edit of mutant.edits) await applyEdit(directory, mutant.name, edit);
  const child = Bun.spawn([process.execPath, 'test', ...target.judgeTestFiles], {
    cwd: REPOSITORY_ROOT,
    env: {
      PATH: Bun.env.PATH ?? '',
      HOME: Bun.env.HOME ?? '',
      ...target.extraEnvironment,
      [target.sourceVariable]: directory,
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

export async function removeMutantCopies(target: MutantTarget): Promise<void> {
  const prefix = target.directoryPrefix;
  const entries = await Array.fromAsync(
    new Bun.Glob(`${prefix}*`).scan({ cwd: target.mutantRoot, onlyFiles: false }),
  );
  await Promise.all(
    entries.map((entry) => rm(`${target.mutantRoot}/${entry}`, { recursive: true, force: true })),
  );
}

// O caso de uso do walk-forward: a cópia leva o `src` INTEIRO da API, porque o módulo importa irmãos (`../backtest`).
export const APP_MUTANT_TARGET: MutantTarget = {
  sourceDirectory: `${REPOSITORY_ROOT}apps/api-cryptoada/src`,
  // Dentro da app: é de lá que `@cryptoada/*` e `zod` se resolvem, como no módulo de produção.
  mutantRoot: `${REPOSITORY_ROOT}apps/api-cryptoada/.mutants`,
  directoryPrefix: 'walk-forward-',
  judgeTestFiles: [
    'test/walk-forward-use-case.contract.test.ts',
    'test/walk-forward-continuity.contract.test.ts',
    'test/walk-forward-failures.contract.test.ts',
    'test/walk-forward-parity.contract.test.ts',
    'test/walk-forward-threads.contract.test.ts',
  ],
  sourceVariable: 'WALK_FORWARD_APP_SOURCE',
};
