// Copyright (c) 2026 Ada Technology. All rights reserved.
import { runDatabaseMutantSuite, type DatabaseMutant } from './mutants/run-database-mutants.js';

const REPOSITORY = 'src/user-assets/user-asset.repository.ts';
const MIGRATION = 'drizzle/0019_user_assets.sql';

function edit(file: string, find: string, replace: string): DatabaseMutant['edits'] {
  return [{ file, find, replace }];
}

// Cada mutante quebra UMA regra dos ativos do usuário no banco; o juiz roda os checks no Postgres real.
const MUTANTS: readonly DatabaseMutant[] = [
  {
    name: 'EVERY_READ_WRITE_WITHOUT_THE_OWNER',
    edits: edit(
      REPOSITORY,
      'return and(ownerCondition(scope, userAssets.userId), eq(userAssets.symbol, symbol));',
      'return eq(userAssets.symbol, symbol);',
    ),
  },
  {
    name: 'PAGE_WITHOUT_THE_OWNER',
    edits: edit(
      REPOSITORY,
      '        ownerCondition(scope, userAssets.userId),\n        params.after === undefined',
      '        params.after === undefined',
    ),
  },
  {
    name: 'LIST_ALL_WITHOUT_THE_OWNER',
    edits: edit(
      REPOSITORY,
      '    .where(ownerCondition(scope, userAssets.userId))\n    .orderBy(asc(userAssets.symbol));',
      '    .orderBy(asc(userAssets.symbol));',
    ),
  },
  {
    name: 'NO_OWNER_LOCK',
    edits: edit(REPOSITORY, "      .for('no key update');", ';'),
  },
  {
    name: 'CEILING_IGNORED',
    edits: edit(REPOSITORY, 'if ((owned[0]?.total ?? 0) >= params.maxAssets) {', 'if (false) {'),
  },
  {
    name: 'CEILING_COUNTS_ONE_TOO_MANY',
    edits: edit(
      REPOSITORY,
      'if ((owned[0]?.total ?? 0) >= params.maxAssets) {',
      'if ((owned[0]?.total ?? 0) > params.maxAssets) {',
    ),
  },
  {
    name: 'REFUSAL_STILL_SAVES',
    edits: edit(
      REPOSITORY,
      'if (decision.kind === USER_ASSET_DECISION_KIND.REFUSE) {',
      'if (false) {',
    ),
  },
  {
    name: 'PAGE_CURSOR_INCLUSIVE',
    edits: edit(
      REPOSITORY,
      'gt(userAssets.symbol, params.after)',
      'sql`${userAssets.symbol} >= ${params.after}`',
    ),
  },
  {
    name: 'PAGE_UNORDERED',
    edits: edit(
      REPOSITORY,
      '    .orderBy(asc(userAssets.symbol))\n    .limit(limit + 1);',
      '    .limit(limit + 1);',
    ),
  },
  {
    name: 'NO_SYMBOL_CHECK',
    edits: edit(
      MIGRATION,
      'CONSTRAINT "user_assets_symbol_check" CHECK ("user_assets"."symbol" ~ \'^[A-Z0-9]{2,16}USDT$\'),\n\t',
      '',
    ),
  },
  {
    name: 'QUANTITY_MAY_BE_NEGATIVE',
    edits: edit(
      MIGRATION,
      'CONSTRAINT "user_assets_quantity_check" CHECK ("user_assets"."quantity" >= 0),\n\t',
      '',
    ),
  },
  {
    name: 'QUANTITY_MAY_NOT_BE_ZERO',
    edits: edit(
      MIGRATION,
      'CHECK ("user_assets"."quantity" >= 0)',
      'CHECK ("user_assets"."quantity" > 0)',
    ),
  },
  {
    name: 'AVERAGE_PRICE_MAY_BE_ZERO',
    edits: edit(
      MIGRATION,
      'CONSTRAINT "user_assets_average_price_check" CHECK ("user_assets"."average_price" > 0)',
      'CONSTRAINT "user_assets_average_price_check" CHECK ("user_assets"."average_price" >= 0)',
    ),
  },
  {
    name: 'SAME_PAIR_TWICE_PER_OWNER',
    edits: edit(
      MIGRATION,
      '\tCONSTRAINT "user_assets_user_id_symbol_unique" UNIQUE("user_id","symbol"),\n',
      '',
    ),
  },
];

try {
  await runDatabaseMutantSuite({
    label: 'user-asset',
    judge: 'test-support/user-asset-test.ts',
    mutants: MUTANTS,
  });
} catch (error: unknown) {
  process.stderr.write(
    `user-asset-mutants: FALHOU - ${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exitCode = 1;
}
