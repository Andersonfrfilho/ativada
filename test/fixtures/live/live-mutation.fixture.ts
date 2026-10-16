// Copyright (c) 2026 Ada Technology. All rights reserved.
import { cp, rm } from 'node:fs/promises';

import { LIVE_MUTANT_VARIABLE } from './live-api.fixture.js';

const REPOSITORY_ROOT = new URL('../../../', import.meta.url).pathname;
const SOURCE_DIRECTORY = `${REPOSITORY_ROOT}apps/worker-ativada/src/live`;
const RECORDING_DIRECTORY = `${REPOSITORY_ROOT}packages/run-recording/src`;
// Dentro da app: é de lá que `@ativada/*` e `zod` se resolvem, como no módulo de produção.
export const LIVE_MUTANT_ROOT = `${REPOSITORY_ROOT}apps/worker-ativada/.mutants`;
// O passo de candle e o mapeamento das decisões moram no pacote de gravação; a cópia dele fica ao lado da cópia ao vivo.
export const LIVE_RECORDING_COPY = 'run-recording-src';
const RECORDING_IMPORT = "from '@ativada/run-recording'";

// Os testes que reprovam o mutante: avaliador, falhas, retomada, paridade com o backtest e agendador.
export const LIVE_JUDGE_TEST_FILES: readonly string[] = [
  'test/live-evaluator.contract.test.ts',
  'test/live-evaluator-failures.contract.test.ts',
  'test/live-evaluator-recovery.contract.test.ts',
  'test/live-gap-wait.contract.test.ts',
  'test/live-parity.contract.test.ts',
  'test/live-alerts.contract.test.ts',
  'test/live-alert-parts.contract.test.ts',
  'test/live-scheduler.contract.test.ts',
  'test/live-goal-step.contract.test.ts',
  'test/live-goal-evaluator.contract.test.ts',
];

// Os testes que reprovam o mutante do analista de risco em sombra: a série do par e o passo com a decisão na transação.
export const LIVE_ANALYST_JUDGE_TEST_FILES: readonly string[] = [
  'test/live-analyst-series.contract.test.ts',
  'test/live-analyst-shadow.contract.test.ts',
];

export type LiveSourceEdit = {
  readonly file: string;
  readonly find: string;
  readonly replace: string;
  readonly occurrences?: number;
};

export type LiveSourceMutant = {
  readonly name: string;
  readonly edits: readonly LiveSourceEdit[];
};

export type LiveMutantVerdict = {
  readonly exitCode: number;
  readonly failedTests: number;
  readonly hasLoadError: boolean;
  // A edição do mutante não se aplicou (o trecho mudou): o mutante não vale nada até ser reescrito.
  readonly problem?: string;
};

async function applyEdit(directory: string, name: string, edit: LiveSourceEdit): Promise<void> {
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

async function pointImportsAtRecordingCopy(directory: string): Promise<void> {
  for await (const name of new Bun.Glob('*.ts').scan(directory)) {
    const path = `${directory}/${name}`;
    const text = await Bun.file(path).text();
    if (!text.includes(RECORDING_IMPORT)) continue;
    await Bun.write(
      path,
      text.replaceAll(RECORDING_IMPORT, `from './${LIVE_RECORDING_COPY}/index.js'`),
    );
  }
}

// Cópia do módulo com as edições; os testes da simulação ao vivo rodam contra ela num processo à parte.
export async function runLiveMutant(
  mutant: LiveSourceMutant,
  judgeFiles: readonly string[] = LIVE_JUDGE_TEST_FILES,
): Promise<LiveMutantVerdict> {
  const directory = `${LIVE_MUTANT_ROOT}/${mutant.name.toLowerCase()}`;
  await cp(SOURCE_DIRECTORY, directory, { recursive: true });
  await cp(RECORDING_DIRECTORY, `${directory}/${LIVE_RECORDING_COPY}`, { recursive: true });
  await pointImportsAtRecordingCopy(directory);
  try {
    for (const edit of mutant.edits) await applyEdit(directory, mutant.name, edit);
  } catch (error: unknown) {
    const problem = error instanceof Error ? error.message : 'edição inválida';
    return { exitCode: -1, failedTests: 0, hasLoadError: false, problem };
  }
  const child = Bun.spawn([process.execPath, 'test', ...judgeFiles], {
    cwd: REPOSITORY_ROOT,
    env: {
      PATH: Bun.env.PATH ?? '',
      HOME: Bun.env.HOME ?? '',
      [LIVE_MUTANT_VARIABLE]: directory,
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

export async function removeLiveMutants(): Promise<void> {
  await rm(LIVE_MUTANT_ROOT, { recursive: true, force: true });
}
