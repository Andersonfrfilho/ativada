// Copyright (c) 2026 Ada Technology. All rights reserved.
import { MIGRATIONS_FOLDER } from '../src/database.constant.js';
import { closeDatabase, openDatabase } from '../src/database-handle.js';
import { applyMigrations } from '../src/migrate.js';
import { readDatabaseUrl } from '../src/read-database-url.js';
import { checkAlerts } from './alert-checks.js';
import { createTemporaryDatabase, dropTemporaryDatabase } from './temporary-database.js';

// Só a caixa de saída dos alertas (T4.5), num banco descartável: é o que o `make alert-mutants` roda contra cada cópia do
// pacote com uma regra da caixa de saída quebrada.
const TEMPORARY_DATABASE_PREFIX = 'ativada_alert_';

function assertCondition(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

function reportCheck(message: string): void {
  process.stdout.write(`alert-test: ${message}\n`);
}

async function runChecks(databaseUrl: string): Promise<void> {
  await applyMigrations({ databaseUrl, migrationsFolder: MIGRATIONS_FOLDER });
  const handle = openDatabase(databaseUrl);
  const client = new Bun.SQL(databaseUrl);
  try {
    await checkAlerts({ handle, client, assertCondition, reportCheck });
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
    `alert-test: FALHOU - ${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exitCode = 1;
}
