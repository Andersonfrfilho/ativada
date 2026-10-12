// Copyright (c) 2026 Ada Technology. All rights reserved.
import { MIGRATIONS_FOLDER } from '../src/database.constant.js';
import { closeDatabase, openDatabase } from '../src/database-handle.js';
import { applyMigrations } from '../src/migrate.js';
import { readDatabaseUrl } from '../src/read-database-url.js';
import { checkPersistenceIsolation } from './persistence-isolation-checks.js';
import { checkRunRepository } from './run-checks.js';
import { checkStrategyPages } from './strategy-page-checks.js';
import { createTemporaryDatabase, dropTemporaryDatabase } from './temporary-database.js';

// Só o isolamento entre donos dos repositórios que as rotas REST usam (estratégias, execuções e resultados), num
// banco descartável: é o que o `make api-runs-mutants` roda contra cada cópia do pacote com um filtro de dono removido.
const TEMPORARY_DATABASE_PREFIX = 'ativada_route_isolation_';

function assertCondition(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

function reportCheck(message: string): void {
  process.stdout.write(`route-isolation-test: ${message}\n`);
}

async function runChecks(databaseUrl: string): Promise<void> {
  await applyMigrations({ databaseUrl, migrationsFolder: MIGRATIONS_FOLDER });
  const handle = openDatabase(databaseUrl);
  const client = new Bun.SQL(databaseUrl);
  try {
    const context = { handle, client, assertCondition, reportCheck };
    await checkStrategyPages(context);
    await checkRunRepository(context);
    await checkPersistenceIsolation(context);
  } finally {
    await client.close();
    await closeDatabase(handle);
  }
}

try {
  const adminUrl = readDatabaseUrl();
  const temporary = await createTemporaryDatabase(adminUrl, TEMPORARY_DATABASE_PREFIX);
  try {
    await runChecks(temporary.url);
  } finally {
    await dropTemporaryDatabase(adminUrl, temporary.databaseName);
  }
  reportCheck('OK');
} catch (error: unknown) {
  process.stderr.write(
    `route-isolation-test: FALHOU - ${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exitCode = 1;
}
