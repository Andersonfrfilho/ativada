// Copyright (c) 2026 Ada Technology. All rights reserved.
import { cp, rm, symlink } from 'node:fs/promises';

const REPOSITORY_ROOT = new URL('../', import.meta.url).pathname;
const PACKAGES_DIRECTORY = `${REPOSITORY_ROOT}packages`;
const SOURCE_PACKAGE = `${PACKAGES_DIRECTORY}/database`;
const COPY_PREFIX = 'dbmutant-';
const JUDGE = 'test-support/route-isolation-test.ts';
const SKIPPED_ENTRIES = ['node_modules', '.mutants'];

type Edit = {
  readonly file: string;
  readonly find: string;
  readonly replace: string;
  readonly occurrences?: number;
};
// `also` é a segunda edição de um mutante que tira o filtro de dono de dois pontos do mesmo repositório.
type Mutant = { readonly name: string; readonly edit: Edit | undefined; readonly also?: Edit };

const WITHOUT = (file: string, find: string, kept: string, occurrences = 1): Edit => ({
  file,
  find,
  replace: kept,
  occurrences,
});

// Cada mutante tira o filtro de dono de UM repositório que alguma rota REST usa; o isolamento no Postgres real
// (`route-isolation-test`) precisa reprovar todos.
const MUTANTS: readonly Mutant[] = [
  { name: 'CONTROL', edit: undefined },
  {
    name: 'STRATEGY_LIST_SHOWS_EVERY_OWNER',
    edit: WITHOUT(
      'src/strategies/strategy-page.ts',
      '        ownerCondition(scope, strategies.userId),\n        isNull(strategies.deletedAt),\n        isBeforeCursor(params.after),',
      '        isNull(strategies.deletedAt),\n        isBeforeCursor(params.after),',
    ),
  },
  {
    name: 'VERSION_LIST_OF_FOREIGN_STRATEGY',
    edit: WITHOUT(
      'src/strategies/strategy-page.ts',
      '        ownerCondition(scope, strategies.userId),\n        eq(strategies.id, params.strategyId),',
      '        eq(strategies.id, params.strategyId),',
    ),
  },
  {
    name: 'STRATEGY_READ_OF_ANY_OWNER',
    edit: WITHOUT(
      'src/strategies/strategy.repository.ts',
      '  return and(\n    ownerCondition(scope, strategies.userId),\n    eq(strategies.id, strategyId),',
      '  return and(\n    eq(strategies.id, strategyId),',
    ),
  },
  {
    name: 'VERSION_READ_OF_ANY_OWNER',
    edit: WITHOUT(
      'src/strategies/strategy.repository.ts',
      '.where(and(ownerCondition(scope, strategyVersions.userId), eq(strategyVersions.id, versionId)))',
      '.where(eq(strategyVersions.id, versionId))',
    ),
  },
  {
    name: 'RUN_READ_OF_ANY_OWNER',
    edit: WITHOUT(
      'src/runs/run.repository.ts',
      '.where(and(ownerCondition(scope, runs.userId), eq(runs.id, runId), isNull(runs.deletedAt)))',
      '.where(and(eq(runs.id, runId), isNull(runs.deletedAt)))',
    ),
    also: WITHOUT(
      'src/runs/run.repository.ts',
      '.where(and(ownerCondition(scope, runs.userId), eq(runs.id, runId)))',
      '.where(eq(runs.id, runId))',
    ),
  },
  {
    name: 'RUN_LIST_SHOWS_EVERY_OWNER',
    edit: WITHOUT('src/runs/run-list.ts', '        ownerCondition(scope, runs.userId),\n', ''),
  },
  {
    name: 'STOP_REVEALS_THE_STATUS_OF_A_FOREIGN_RUN',
    edit: WITHOUT(
      'src/runs/run-transition.ts',
      '.where(and(ownerCondition(scope, runs.userId), eq(runs.id, runId)))',
      '.where(eq(runs.id, runId))',
    ),
  },
  {
    name: 'STOP_UPDATES_A_FOREIGN_RUN',
    edit: WITHOUT(
      'src/runs/run-transition.ts',
      '              ownerCondition(scope, runs.userId),\n              eq(runs.id, params.runId),',
      '              eq(runs.id, params.runId),',
    ),
  },
  {
    name: 'RUN_CREATED_ON_A_FOREIGN_VERSION',
    edit: WITHOUT(
      'src/runs/run.repository.ts',
      '.where(and(ownerCondition(scope, strategyVersions.userId), eq(strategyVersions.id, versionId)))',
      '.where(eq(strategyVersions.id, versionId))',
    ),
  },
  {
    name: 'RESULT_LIST_OF_FOREIGN_RUN_IS_EMPTY_NOT_ABSENT',
    edit: WITHOUT(
      'src/run-results/run-result.repository.ts',
      '    if (!(await isOwnedRun(database, scope, runId))) return undefined;\n    return list(',
      '    return list(',
    ),
  },
  {
    name: 'OWNED_RUN_CHECK_IGNORES_THE_OWNER',
    edit: WITHOUT(
      'src/runs/run-ownership.ts',
      '.where(and(ownerCondition(scope, runs.userId), eq(runs.id, runId), isNull(runs.deletedAt)))',
      '.where(and(eq(runs.id, runId), isNull(runs.deletedAt)))',
    ),
  },
  {
    name: 'FILL_MARKERS_READ_EVERY_OWNER',
    edit: WITHOUT(
      'src/run-results/run-fill-markers.ts',
      '    ownerCondition(scope, fills.userId),\n    eq(fills.runId, runId),\n    gte(fills.candleTime, params.from),',
      '    eq(fills.runId, runId),\n    gte(fills.candleTime, params.from),',
    ),
  },
  {
    name: 'FILL_CLUSTERS_READ_EVERY_OWNER',
    edit: WITHOUT(
      'src/run-results/run-fill-markers.ts',
      '      WHERE user_id = ${scope.ownerUserId} AND run_id = ${runId}\n',
      '      WHERE run_id = ${runId}\n',
    ),
  },
  {
    name: 'FILLS_OF_POSITIONS_READ_EVERY_OWNER',
    edit: WITHOUT(
      'src/run-results/run-fill-list.ts',
      '        ownerCondition(scope, fills.userId),\n        eq(fills.runId, runId),\n        inArray',
      '        eq(fills.runId, runId),\n        inArray',
    ),
  },
  {
    name: 'TRADE_TOTALS_SUM_EVERY_OWNER',
    edit: WITHOUT(
      'src/run-results/run-trade-totals.ts',
      '    WHERE p.user_id = ${scope.ownerUserId} AND p.run_id = ${runId}`',
      '    WHERE p.run_id = ${runId}`',
    ),
  },
  {
    name: 'POSITION_RANGE_READ_EVERY_OWNER',
    edit: WITHOUT(
      'src/run-results/run-position-list.ts',
      '        ownerCondition(scope, positions.userId),\n        eq(positions.runId, runId),\n        afterPosition',
      '        eq(positions.runId, runId),\n        afterPosition',
    ),
  },
  {
    name: 'PRICE_COLUMNS_OF_FOREIGN_RUN_ARE_NOT_ABSENT',
    edit: WITHOUT(
      'src/run-results/run-result.repository.ts',
      '      (await isOwnedRun(database, scope, runId))\n        ? listPriceColumns({ executor: database, params })\n        : undefined,',
      '      listPriceColumns({ executor: database, params }),',
    ),
  },
  {
    name: 'FILL_MARKERS_OF_FOREIGN_RUN_ARE_NOT_ABSENT',
    edit: WITHOUT(
      'src/run-results/run-result.repository.ts',
      '      (await isOwnedRun(database, scope, runId))\n        ? listFillMarkers({ executor: database, scope, runId, params })\n        : undefined,',
      '      listFillMarkers({ executor: database, scope, runId, params }),',
    ),
  },
  {
    name: 'FILL_COUNT_OF_FOREIGN_RUN_IS_NOT_ABSENT',
    edit: WITHOUT(
      'src/run-results/run-result.repository.ts',
      '      (await isOwnedRun(database, scope, runId))\n        ? countFillsInRange({ executor: database, scope, runId, params: range })\n        : undefined,',
      '      countFillsInRange({ executor: database, scope, runId, params: range }),',
    ),
  },
  {
    name: 'FILL_CLUSTERS_OF_FOREIGN_RUN_ARE_NOT_ABSENT',
    edit: WITHOUT(
      'src/run-results/run-result.repository.ts',
      '      (await isOwnedRun(database, scope, runId))\n        ? listFillClusters({ executor: database, scope, runId, params })\n        : undefined,',
      '      listFillClusters({ executor: database, scope, runId, params }),',
    ),
  },
  {
    name: 'TRADE_TOTALS_OF_FOREIGN_RUN_ARE_NOT_ABSENT',
    edit: WITHOUT(
      'src/run-results/run-result.repository.ts',
      '      (await isOwnedRun(database, scope, runId))\n        ? readTradeTotals({ executor: database, scope, runId })\n        : undefined,',
      '      readTradeTotals({ executor: database, scope, runId }),',
    ),
  },
];

type Verdict = { readonly name: string; readonly exitCode: number; readonly output: string };

async function applyEdit(directory: string, name: string, edit: Edit): Promise<void> {
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
async function runMutant(mutant: Mutant): Promise<Verdict> {
  const directory = `${PACKAGES_DIRECTORY}/${COPY_PREFIX}${mutant.name.toLowerCase().replaceAll('_', '-')}`;
  await cp(SOURCE_PACKAGE, directory, {
    recursive: true,
    filter: (source) => !SKIPPED_ENTRIES.some((skipped) => source.endsWith(`/${skipped}`)),
  });
  try {
    await symlink(`${SOURCE_PACKAGE}/node_modules`, `${directory}/node_modules`);
    if (mutant.edit !== undefined) await applyEdit(directory, mutant.name, mutant.edit);
    if (mutant.also !== undefined) await applyEdit(directory, mutant.name, mutant.also);
    const child = Bun.spawn([process.execPath, 'run', `${directory}/${JUDGE}`], {
      cwd: REPOSITORY_ROOT,
      env: {
        PATH: Bun.env.PATH ?? '',
        HOME: Bun.env.HOME ?? '',
        DATABASE_URL: Bun.env['DATABASE_URL'] ?? '',
      },
      stdout: 'pipe',
      stderr: 'pipe',
    });
    const [output, errors, exitCode] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ]);
    return {
      name: mutant.name,
      exitCode,
      output: `${output}${errors}`.trim().split('\n').at(-1) ?? '',
    };
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

async function main(): Promise<void> {
  const failures: string[] = [];
  for (const mutant of MUTANTS) {
    const verdict = await runMutant(mutant);
    const isControl = mutant.edit === undefined;
    const isCaught = verdict.exitCode !== 0;
    const isExpected = isControl ? !isCaught : isCaught;
    process.stdout.write(
      `api-runs-mutants: ${verdict.name}: ${isControl ? (isCaught ? 'FALHOU' : 'passa (arnês sólido)') : isCaught ? 'REPROVADO' : 'SOBREVIVEU'}${isCaught ? ` - ${verdict.output.slice(0, 160)}` : ''}\n`,
    );
    if (!isExpected) failures.push(verdict.name);
  }
  if (failures.length > 0)
    throw new Error(`mutantes que sobreviveram (ou controle que falhou): ${failures.join(', ')}`);
  process.stdout.write(
    `api-runs-mutants: OK - ${MUTANTS.length - 1} mutantes de filtro de dono reprovados\n`,
  );
}

try {
  await main();
} catch (error: unknown) {
  process.stderr.write(
    `api-runs-mutants: FALHOU - ${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exitCode = 1;
}
