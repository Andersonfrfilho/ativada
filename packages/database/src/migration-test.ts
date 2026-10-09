// Copyright (c) 2026 Ada Technology. All rights reserved.
import { randomUUID } from 'node:crypto';
import { MIGRATIONS_FOLDER, ROLLBACK_SUFFIX } from './database.constant.js';
import { applyMigrations } from './migrate.js';
import { applyRollbacks } from './rollback.js';
import { readDatabaseUrl } from './read-database-url.js';

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

async function createTemporaryDatabase(
  adminUrl: string,
): Promise<{ readonly databaseName: string; readonly url: string }> {
  const databaseName = `${TEMPORARY_DATABASE_PREFIX}${randomUUID().replaceAll('-', '')}`;
  const admin = new Bun.SQL(adminUrl);
  try {
    await admin.unsafe(`CREATE DATABASE "${databaseName}"`);
  } finally {
    await admin.close();
  }
  const temporaryUrl = new URL(adminUrl);
  temporaryUrl.pathname = `/${databaseName}`;
  return { databaseName, url: temporaryUrl.toString() };
}

async function dropTemporaryDatabase(adminUrl: string, databaseName: string): Promise<void> {
  const admin = new Bun.SQL(adminUrl);
  try {
    await admin.unsafe(`DROP DATABASE IF EXISTS "${databaseName}" WITH (FORCE)`);
  } finally {
    await admin.close();
  }
}

async function runMigrationTest(adminUrl: string): Promise<number> {
  const migrationFileNames = await listMigrationFileNames(MIGRATIONS_FOLDER);
  if (migrationFileNames.length === 0) throw new Error('nenhuma migration encontrada');

  const temporary = await createTemporaryDatabase(adminUrl);
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
