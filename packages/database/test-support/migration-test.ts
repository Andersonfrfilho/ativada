// Copyright (c) 2026 Ada Technology. All rights reserved.
import { MIGRATIONS_FOLDER, ROLLBACK_SUFFIX } from '../src/database.constant.js';
import { applyMigrations } from '../src/migrate.js';
import { applyRollbacks } from './rollback.js';
import { readDatabaseUrl } from '../src/read-database-url.js';
import { createTemporaryDatabase, dropTemporaryDatabase } from './temporary-database.js';

const TEMPORARY_DATABASE_PREFIX = 'crypto_migration_';

type CountRow = { readonly total: number };
type TableNameRow = { readonly table_name: string };

async function listMigrationFileNames(migrationsFolder: string): Promise<string[]> {
  const glob = new Bun.Glob('*.sql');
  const fileNames: string[] = [];
  for await (const fileName of glob.scan({ cwd: migrationsFolder })) {
    if (!fileName.endsWith(ROLLBACK_SUFFIX)) fileNames.push(fileName);
  }
  return fileNames;
}

async function countAppliedMigrations(databaseUrl: string): Promise<number> {
  const client = new Bun.SQL(databaseUrl);
  try {
    const rows: unknown =
      await client`SELECT count(*)::int AS total FROM drizzle.__drizzle_migrations`;
    return (rows as readonly CountRow[])[0]?.total ?? 0;
  } finally {
    await client.close();
  }
}

async function listPublicTables(databaseUrl: string): Promise<string[]> {
  const client = new Bun.SQL(databaseUrl);
  try {
    const rows: unknown =
      await client`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`;
    return (rows as readonly TableNameRow[]).map((row) => row.table_name);
  } finally {
    await client.close();
  }
}

async function runMigrationTest(adminUrl: string): Promise<number> {
  const migrationFileNames = await listMigrationFileNames(MIGRATIONS_FOLDER);
  if (migrationFileNames.length === 0) throw new Error('nenhuma migration encontrada');

  const temporary = await createTemporaryDatabase(adminUrl, TEMPORARY_DATABASE_PREFIX);
  try {
    await applyMigrations({ databaseUrl: temporary.url, migrationsFolder: MIGRATIONS_FOLDER });
    const appliedCount = await countAppliedMigrations(temporary.url);
    if (appliedCount !== migrationFileNames.length) {
      throw new Error(
        `${appliedCount} migrations registradas, ${migrationFileNames.length} esperadas`,
      );
    }

    await applyRollbacks({ databaseUrl: temporary.url, migrationsFolder: MIGRATIONS_FOLDER });
    const leftoverTables = await listPublicTables(temporary.url);
    if (leftoverTables.length > 0) {
      throw new Error(`rollback deixou tabelas em public: ${leftoverTables.join(', ')}`);
    }
    return appliedCount;
  } finally {
    await dropTemporaryDatabase(adminUrl, temporary.databaseName);
  }
}

async function main(): Promise<void> {
  const adminUrl = readDatabaseUrl();
  const admin = new Bun.SQL(adminUrl);
  try {
    await admin`SELECT 1`;
  } catch (error: unknown) {
    await admin.close();
    throw new Error('Postgres não respondeu em DATABASE_URL', { cause: error });
  }
  await admin.close();

  const appliedCount = await runMigrationTest(adminUrl);
  console.log(`migration-test: OK (${appliedCount} migrations aplicadas e desfeitas)`);
}

try {
  await main();
} catch (error: unknown) {
  console.error(
    `migration-test: FALHOU - ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exitCode = 1;
}
