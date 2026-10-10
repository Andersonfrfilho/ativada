// Copyright (c) 2026 Ada Technology. All rights reserved.
import { runDatabaseMutantSuite, type DatabaseMutant } from './mutants/run-database-mutants.js';

const SEED = 'src/strategies/example-strategy-seed.ts';
const MARKER_CONDITION = '          isNull(users.exampleStrategySeededAt),\n';
const INDEX_STATEMENT =
  'CREATE UNIQUE INDEX "strategies_user_id_example_unique" ON "strategies" USING btree ("user_id") WHERE "strategies"."is_example";';

// Cada mutante quebra UMA regra da semeadura da estratégia de exemplo; o juiz roda os checks no Postgres real.
const MUTANTS: readonly DatabaseMutant[] = [
  {
    name: 'SEEDS_WITHOUT_THE_MARKER',
    edits: [{ file: SEED, find: MARKER_CONDITION, replace: '' }],
  },
  {
    name: 'NO_PARTIAL_UNIQUE_INDEX',
    edits: [{ file: 'drizzle/0011_example_strategy_seed.sql', find: INDEX_STATEMENT, replace: '' }],
  },
  {
    name: 'SEEDS_AGAIN_AFTER_THE_EXAMPLE_IS_GONE',
    edits: [
      {
        file: SEED,
        find: MARKER_CONDITION,
        replace:
          '          sql`not exists (select 1 from strategies s where s.user_id = ${users.id} and s.is_example and s.deleted_at is null)`,\n',
      },
    ],
  },
  {
    name: 'EVERY_USER_SHARES_THE_SAME_ROW',
    edits: [
      {
        file: SEED,
        find: '      id: Bun.randomUUIDv7(),\n      userId: scope.ownerUserId,\n      name: params.name,\n      isExample: true,',
        replace:
          "      id: '0192f3a1-7c4e-7b2a-9d3f-5e6a7b8c9d00',\n      userId: scope.ownerUserId,\n      name: params.name,\n      isExample: true,",
      },
    ],
  },
  {
    name: 'INACTIVE_ACCOUNTS_ARE_SEEDED',
    edits: [
      {
        file: SEED,
        find: '          isNull(users.deletedAt),\n          isNull(users.blockedAt),\n',
        replace: '',
      },
    ],
  },
  {
    name: 'MARKER_COMMITS_OUTSIDE_THE_TRANSACTION',
    edits: [
      {
        file: SEED,
        find: 'const marked = await transaction\n      .update(users)',
        replace:
          'const marked = await (database as unknown as typeof transaction)\n      .update(users)',
      },
    ],
  },
];

try {
  await runDatabaseMutantSuite({
    label: 'example',
    judge: 'test-support/example-strategy-test.ts',
    mutants: MUTANTS,
  });
} catch (error: unknown) {
  process.stderr.write(
    `example-mutants: FALHOU - ${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exitCode = 1;
}
