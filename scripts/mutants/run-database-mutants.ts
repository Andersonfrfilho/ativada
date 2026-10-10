// Copyright (c) 2026 Ada Technology. All rights reserved.
import { cp, rm, symlink } from 'node:fs/promises';

const REPOSITORY_ROOT = new URL('../../', import.meta.url).pathname;
const PACKAGES_DIRECTORY = `${REPOSITORY_ROOT}packages`;
const SOURCE_PACKAGE = `${PACKAGES_DIRECTORY}/database`;
const COPY_PREFIX = 'dbmutant-';
const SKIPPED_ENTRIES = ['node_modules', '.mutants'];
const OUTPUT_EXCERPT_LENGTH = 160;
// Um mutante que trava o juiz (por exemplo, esgotando o pool de conexões) conta como reprovado.
const JUDGE_TIMEOUT_MILLISECONDS = 120_000;
const TIMEOUT_EXIT_CODE = 124;

export type DatabaseEdit = {
  readonly file: string;
  readonly find: string;
  readonly replace: string;
  readonly occurrences?: number;
};

export type DatabaseMutant = {
  readonly name: string;
  readonly edits: readonly DatabaseEdit[];
};

export type DatabaseMutantSuite = {
  readonly label: string;
  // O arquivo (relativo a `packages/database`) que reprova o mutante: roda num banco descartável.
  readonly judge: string;
  readonly mutants: readonly DatabaseMutant[];
};

type Verdict = { readonly exitCode: number; readonly output: string };

async function applyEdit(directory: string, name: string, edit: DatabaseEdit): Promise<void> {
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

// A cópia fica ao lado de `packages/database` (mesma profundidade: os imports relativos dos testes continuam valendo)
// e usa o `node_modules` dele por link.
async function runMutant(suite: DatabaseMutantSuite, mutant: DatabaseMutant): Promise<Verdict> {
  const slug = mutant.name.toLowerCase().replaceAll('_', '-');
  const directory = `${PACKAGES_DIRECTORY}/${COPY_PREFIX}${suite.label}-${slug}`;
  await cp(SOURCE_PACKAGE, directory, {
    recursive: true,
    filter: (source) => !SKIPPED_ENTRIES.some((skipped) => source.endsWith(`/${skipped}`)),
  });
  try {
    await symlink(`${SOURCE_PACKAGE}/node_modules`, `${directory}/node_modules`);
    for (const edit of mutant.edits) await applyEdit(directory, mutant.name, edit);
    const child = Bun.spawn([process.execPath, 'run', `${directory}/${suite.judge}`], {
      cwd: REPOSITORY_ROOT,
      env: {
        PATH: Bun.env.PATH ?? '',
        HOME: Bun.env.HOME ?? '',
        DATABASE_URL: Bun.env['DATABASE_URL'] ?? '',
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
    if (isTimedOut)
      return { exitCode: TIMEOUT_EXIT_CODE, output: 'o juiz travou (tempo esgotado)' };
    return { exitCode, output: `${output}${errors}`.trim().split('\n').at(-1) ?? '' };
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

function describeVerdict(isControl: boolean, isCaught: boolean): string {
  if (isControl) return isCaught ? 'FALHOU' : 'passa (arnês sólido)';
  return isCaught ? 'REPROVADO' : 'SOBREVIVEU';
}

// O controle (cópia sem edição) tem de PASSAR; cada mutante tem de ser REPROVADO pelo juiz.
export async function runDatabaseMutantSuite(suite: DatabaseMutantSuite): Promise<void> {
  const failures: string[] = [];
  const cases = [{ name: 'CONTROL', edits: [] } satisfies DatabaseMutant, ...suite.mutants];
  for (const mutant of cases) {
    const verdict = await runMutant(suite, mutant);
    const isControl = mutant.edits.length === 0;
    const isCaught = verdict.exitCode !== 0;
    const excerpt = isCaught ? ` - ${verdict.output.slice(0, OUTPUT_EXCERPT_LENGTH)}` : '';
    process.stdout.write(
      `${suite.label}-mutants: ${mutant.name}: ${describeVerdict(isControl, isCaught)}${excerpt}\n`,
    );
    if (isControl === isCaught) failures.push(mutant.name);
  }
  if (failures.length > 0) {
    throw new Error(`mutantes que sobreviveram (ou controle que falhou): ${failures.join(', ')}`);
  }
  process.stdout.write(
    `${suite.label}-mutants: OK - ${suite.mutants.length} mutantes reprovados\n`,
  );
}
