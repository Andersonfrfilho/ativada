// Copyright (c) 2026 Ada Technology. All rights reserved.
import { cp, rm } from 'node:fs/promises';

import { LIVE_SOURCE_VARIABLE } from '../live-test/live-source.js';

const REPOSITORY_ROOT = new URL('../../', import.meta.url).pathname;
const SOURCE_DIRECTORY = `${REPOSITORY_ROOT}apps/worker-cryptoada/src/live`;
const RECORDING_DIRECTORY = `${REPOSITORY_ROOT}packages/run-recording/src`;
const MUTANT_ROOT = `${REPOSITORY_ROOT}apps/worker-cryptoada/.mutants`;
const RECORDING_COPY = 'run-recording-src';
const RECORDING_IMPORT = "from '@cryptoada/run-recording'";
const OUTPUT_EXCERPT_LENGTH = 160;
const JUDGE_TIMEOUT_MILLISECONDS = 280_000;
const TIMEOUT_EXIT_CODE = 124;

export type LiveSourceEdit = {
  readonly file: string;
  readonly find: string;
  readonly replace: string;
};
export type LiveSourceMutant = { readonly name: string; readonly edits: readonly LiveSourceEdit[] };

export type LiveSourceMutantSuite = {
  readonly label: string;
  // O script (relativo à raiz) que reprova o mutante: roda num banco descartável e lê `LIVE_MUTANT_SOURCE`.
  readonly judge: string;
  readonly mutants: readonly LiveSourceMutant[];
};

type Verdict = { readonly exitCode: number; readonly output: string };

async function applyEdit(directory: string, name: string, change: LiveSourceEdit): Promise<void> {
  const path = `${directory}/${change.file}`;
  const text = await Bun.file(path).text();
  const found = text.split(change.find).length - 1;
  if (found !== 1) {
    throw new Error(`Mutante ${name}: "${change.find}" aparece ${found}x em ${change.file}.`);
  }
  await Bun.write(
    path,
    text.replace(change.find, () => change.replace),
  );
}

async function pointImportsAtRecordingCopy(directory: string): Promise<void> {
  for await (const name of new Bun.Glob('*.ts').scan(directory)) {
    const path = `${directory}/${name}`;
    const text = await Bun.file(path).text();
    if (!text.includes(RECORDING_IMPORT)) continue;
    await Bun.write(path, text.replaceAll(RECORDING_IMPORT, `from './${RECORDING_COPY}/index.js'`));
  }
}

async function judge(suite: LiveSourceMutantSuite, mutant: LiveSourceMutant): Promise<Verdict> {
  const directory = `${MUTANT_ROOT}/${suite.label}-${mutant.name.toLowerCase().replaceAll('_', '-')}`;
  await cp(SOURCE_DIRECTORY, directory, { recursive: true });
  await cp(RECORDING_DIRECTORY, `${directory}/${RECORDING_COPY}`, { recursive: true });
  await pointImportsAtRecordingCopy(directory);
  for (const change of mutant.edits) await applyEdit(directory, mutant.name, change);
  const child = Bun.spawn(
    [process.execPath, '--env-file=envs/env.test', 'run', `${REPOSITORY_ROOT}${suite.judge}`],
    {
      cwd: REPOSITORY_ROOT,
      env: {
        PATH: Bun.env['PATH'] ?? '',
        HOME: Bun.env['HOME'] ?? '',
        DATABASE_URL: Bun.env['DATABASE_URL'] ?? '',
        [LIVE_SOURCE_VARIABLE]: directory,
      },
      stdout: 'pipe',
      stderr: 'pipe',
    },
  );
  let isTimedOut = false;
  const timer = setTimeout(() => {
    isTimedOut = true;
    child.kill();
  }, JUDGE_TIMEOUT_MILLISECONDS);
  const [output, errors, exitCode] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  clearTimeout(timer);
  if (isTimedOut) return { exitCode: TIMEOUT_EXIT_CODE, output: 'o juiz travou (tempo esgotado)' };
  return { exitCode, output: `${output}${errors}`.trim().split('\n').at(-1) ?? '' };
}

function describeVerdict(isControl: boolean, isCaught: boolean): string {
  if (isControl) return isCaught ? 'FALHOU' : 'passa (arnês sólido)';
  return isCaught ? 'REPROVADO' : 'SOBREVIVEU';
}

// O controle (cópia sem edição) tem de PASSAR; cada mutante tem de ser REPROVADO pelo juiz.
export async function runLiveSourceMutantSuite(suite: LiveSourceMutantSuite): Promise<void> {
  const cases: readonly LiveSourceMutant[] = [{ name: 'CONTROL', edits: [] }, ...suite.mutants];
  const failures: string[] = [];
  try {
    for (const mutant of cases) {
      const verdict = await judge(suite, mutant);
      const isControl = mutant.edits.length === 0;
      const isCaught = verdict.exitCode !== 0;
      const excerpt = isCaught ? ` - ${verdict.output.slice(0, OUTPUT_EXCERPT_LENGTH)}` : '';
      process.stdout.write(
        `${suite.label}-mutants: ${mutant.name}: ${describeVerdict(isControl, isCaught)}${excerpt}\n`,
      );
      if (isControl === isCaught) failures.push(mutant.name);
    }
  } finally {
    await rm(MUTANT_ROOT, { recursive: true, force: true });
  }
  if (failures.length > 0) {
    throw new Error(`mutantes que sobreviveram (ou controle que falhou): ${failures.join(', ')}`);
  }
  process.stdout.write(
    `${suite.label}-mutants: OK - ${suite.mutants.length} mutantes reprovados\n`,
  );
}
