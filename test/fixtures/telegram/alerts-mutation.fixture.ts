// Copyright (c) 2026 Ada Technology. All rights reserved.
import { cp, rm } from 'node:fs/promises';

import { ALERTS_MUTANT_VARIABLE } from './alerts-api.fixture.js';

const REPOSITORY_ROOT = new URL('../../../', import.meta.url).pathname;
const SOURCE_DIRECTORY = `${REPOSITORY_ROOT}apps/worker-cryptoada/src/alerts`;
const PAYLOAD_SCHEMA = `${REPOSITORY_ROOT}apps/worker-cryptoada/src/live/alert-payload.schema.ts`;
// Dentro da app: é de lá que `@cryptoada/*` e `zod` se resolvem, como no módulo de produção.
export const ALERTS_MUTANT_ROOT = `${REPOSITORY_ROOT}apps/worker-cryptoada/.alert-mutants`;
const PAYLOAD_IMPORT = "'../live/alert-payload.schema.js'";
const PAYLOAD_COPY_IMPORT = "'./alert-payload.schema.js'";

// Os testes que reprovam o mutante: cliente, texto, despachante e agendador.
export const ALERTS_JUDGE_TEST_FILES: readonly string[] = [
  'test/telegram-client.contract.test.ts',
  'test/alert-message.contract.test.ts',
  'test/alert-dispatcher.contract.test.ts',
  'test/alert-scheduler.contract.test.ts',
];

export type AlertsSourceEdit = {
  readonly file: string;
  readonly find: string;
  readonly replace: string;
  readonly occurrences?: number;
};

export type AlertsSourceMutant = {
  readonly name: string;
  readonly edits: readonly AlertsSourceEdit[];
};

export type AlertsMutantVerdict = {
  readonly exitCode: number;
  readonly failedTests: number;
  readonly hasLoadError: boolean;
  // A edição do mutante não se aplicou (o trecho mudou): o mutante não vale nada até ser reescrito.
  readonly problem?: string;
};

async function applyEdit(directory: string, name: string, edit: AlertsSourceEdit): Promise<void> {
  const path = `${directory}/${edit.file}`;
  const text = await Bun.file(path).text();
  const found = text.split(edit.find).length - 1;
  if (found !== (edit.occurrences ?? 1)) {
    throw new Error(`Mutante ${name}: "${edit.find}" aparece ${found}x em ${edit.file}.`);
  }
  await Bun.write(
    path,
    text.replaceAll(edit.find, () => edit.replace),
  );
}

// O esquema do conteúdo mora ao lado do passo ao vivo; a cópia do despacho leva o dela e aponta os imports para ele.
async function pointImportsAtPayloadCopy(directory: string): Promise<void> {
  for await (const name of new Bun.Glob('*.ts').scan(directory)) {
    const path = `${directory}/${name}`;
    const text = await Bun.file(path).text();
    if (!text.includes(PAYLOAD_IMPORT)) continue;
    await Bun.write(path, text.replaceAll(PAYLOAD_IMPORT, PAYLOAD_COPY_IMPORT));
  }
}

// Cópia do módulo com as edições; os testes do despacho rodam contra ela num processo à parte.
export async function runAlertsMutant(mutant: AlertsSourceMutant): Promise<AlertsMutantVerdict> {
  const directory = `${ALERTS_MUTANT_ROOT}/${mutant.name.toLowerCase()}`;
  await cp(SOURCE_DIRECTORY, directory, { recursive: true });
  await cp(PAYLOAD_SCHEMA, `${directory}/alert-payload.schema.ts`);
  await pointImportsAtPayloadCopy(directory);
  try {
    for (const edit of mutant.edits) await applyEdit(directory, mutant.name, edit);
  } catch (error: unknown) {
    const problem = error instanceof Error ? error.message : 'edição inválida';
    return { exitCode: -1, failedTests: 0, hasLoadError: false, problem };
  }
  const child = Bun.spawn([process.execPath, 'test', ...ALERTS_JUDGE_TEST_FILES], {
    cwd: REPOSITORY_ROOT,
    env: {
      PATH: Bun.env.PATH ?? '',
      HOME: Bun.env.HOME ?? '',
      [ALERTS_MUTANT_VARIABLE]: directory,
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

export async function removeAlertsMutants(): Promise<void> {
  await rm(ALERTS_MUTANT_ROOT, { recursive: true, force: true });
}
