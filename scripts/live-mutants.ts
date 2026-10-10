// Copyright (c) 2026 Ada Technology. All rights reserved.
import { cp, rm } from 'node:fs/promises';

import { LIVE_SOURCE_VARIABLE } from './live-test/live-source.js';

const REPOSITORY_ROOT = new URL('../', import.meta.url).pathname;
const SOURCE_DIRECTORY = `${REPOSITORY_ROOT}apps/worker-cryptoada/src/live`;
const RECORDING_DIRECTORY = `${REPOSITORY_ROOT}packages/run-recording/src`;
const MUTANT_ROOT = `${REPOSITORY_ROOT}apps/worker-cryptoada/.mutants`;
const RECORDING_COPY = 'run-recording-src';
const RECORDING_IMPORT = "from '@cryptoada/run-recording'";
const DATABASE_FILE = 'create-live-run-database.ts';
const JUDGE = `${REPOSITORY_ROOT}scripts/live-test.ts`;
const OUTPUT_EXCERPT_LENGTH = 160;
const JUDGE_TIMEOUT_MILLISECONDS = 280_000;
const TIMEOUT_EXIT_CODE = 124;

type Edit = { readonly file: string; readonly find: string; readonly replace: string };
type Mutant = { readonly name: string; readonly edits: readonly Edit[] };

function edit(file: string, find: string, replace: string): Edit[] {
  return [{ file, find, replace }];
}

// Cada mutante quebra UMA regra do adaptador do banco da simulação ao vivo; o juiz é o `live-test` inteiro, contra um
// Postgres descartável, que tem de falhar.
const MUTANTS: readonly Mutant[] = [
  {
    name: 'STEP_SPLIT_IN_TWO_TRANSACTIONS',
    edits: [
      ...edit(
        DATABASE_FILE,
        '        if (!(await writer.saveCheckpoint(commit.checkpoint))) throw new StepAlreadyRecordedError();\n        return LIVE_COMMIT_OUTCOME.COMMITTED;',
        '        return LIVE_COMMIT_OUTCOME.COMMITTED;',
      ),
      ...edit(
        DATABASE_FILE,
        '    return outcome ?? LIVE_COMMIT_OUTCOME.VANISHED;',
        '    if (outcome === LIVE_COMMIT_OUTCOME.COMMITTED) {\n      await batches.runInBatch(target.scope, target.runId, (writer) =>\n        writer.saveCheckpoint(commit.checkpoint),\n      );\n    }\n    return outcome ?? LIVE_COMMIT_OUTCOME.VANISHED;',
      ),
    ],
  },
  {
    name: 'REFUSED_CHECKPOINT_KEEPS_THE_ROWS',
    edits: edit(
      DATABASE_FILE,
      'if (!(await writer.saveCheckpoint(commit.checkpoint))) throw new StepAlreadyRecordedError();',
      'await writer.saveCheckpoint(commit.checkpoint);',
    ),
  },
  {
    name: 'WRONG_EXCHANGE',
    edits: edit(
      DATABASE_FILE,
      '...target.series, ...window',
      "...target.series, exchange: 'outra', ...window",
    ),
  },
  {
    name: 'CANDLES_READ_FROM_THE_BEGINNING',
    edits: edit(
      DATABASE_FILE,
      'candles.findCandles({ ...target.series, ...window })',
      'candles.findCandles({ ...target.series, ...window, from: 0 })',
    ),
  },
  {
    name: 'SENTIMENT_INSERTION_CUTOFF_DROPPED',
    edits: edit(
      DATABASE_FILE,
      'insertedUntil: new Date(query.until),',
      'insertedUntil: new Date(8_640_000_000_000_000),',
    ),
  },
  {
    name: 'FAILURE_NEVER_WRITTEN',
    edits: edit(
      DATABASE_FILE,
      '(await runs.transitionRun(scope, { runId, to: RUN_STATUS.FAILED, errorCode })).outcome ===\n      RUN_TRANSITION_OUTCOME.TRANSITIONED',
      'false',
    ),
  },
];

type Verdict = { readonly exitCode: number; readonly output: string };

async function applyEdit(directory: string, name: string, change: Edit): Promise<void> {
  const path = `${directory}/${change.file}`;
  const text = await Bun.file(path).text();
  const found = text.split(change.find).length - 1;
  if (found !== 1)
    throw new Error(`Mutante ${name}: "${change.find}" aparece ${found}x em ${change.file}.`);
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

async function judge(mutant: Mutant): Promise<Verdict> {
  const directory = `${MUTANT_ROOT}/${mutant.name.toLowerCase().replaceAll('_', '-')}`;
  await cp(SOURCE_DIRECTORY, directory, { recursive: true });
  await cp(RECORDING_DIRECTORY, `${directory}/${RECORDING_COPY}`, { recursive: true });
  await pointImportsAtRecordingCopy(directory);
  for (const change of mutant.edits) await applyEdit(directory, mutant.name, change);
  const child = Bun.spawn([process.execPath, '--env-file=envs/env.test', 'run', JUDGE], {
    cwd: REPOSITORY_ROOT,
    env: {
      PATH: Bun.env['PATH'] ?? '',
      HOME: Bun.env['HOME'] ?? '',
      DATABASE_URL: Bun.env['DATABASE_URL'] ?? '',
      [LIVE_SOURCE_VARIABLE]: directory,
    },
    stdout: 'pipe',
    stderr: 'pipe',
  });
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

async function main(): Promise<void> {
  const selected = (Bun.env['LIVE_MUTANTS'] ?? '').split(',').filter((name) => name.length > 0);
  const cases: readonly Mutant[] = [
    { name: 'CONTROL', edits: [] },
    ...(selected.length === 0
      ? MUTANTS
      : MUTANTS.filter((mutant) => selected.includes(mutant.name))),
  ];
  const failures: string[] = [];
  try {
    for (const mutant of cases) {
      const verdict = await judge(mutant);
      const isControl = mutant.edits.length === 0;
      const isCaught = verdict.exitCode !== 0;
      const excerpt = isCaught ? ` - ${verdict.output.slice(0, OUTPUT_EXCERPT_LENGTH)}` : '';
      process.stdout.write(
        `live-mutants: ${mutant.name}: ${describeVerdict(isControl, isCaught)}${excerpt}\n`,
      );
      if (isControl === isCaught) failures.push(mutant.name);
    }
  } finally {
    await rm(MUTANT_ROOT, { recursive: true, force: true });
  }
  if (failures.length > 0) {
    throw new Error(`mutantes que sobreviveram (ou controle que falhou): ${failures.join(', ')}`);
  }
  process.stdout.write(`live-mutants: OK - ${cases.length - 1} mutantes reprovados\n`);
}

try {
  await main();
} catch (error: unknown) {
  process.stderr.write(
    `live-mutants: FALHOU - ${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exitCode = 1;
}
