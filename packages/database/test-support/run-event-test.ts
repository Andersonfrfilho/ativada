// Copyright (c) 2026 Ada Technology. All rights reserved.
import { MIGRATIONS_FOLDER } from '../src/database.constant.js';
import { closeDatabase, openDatabase } from '../src/database-handle.js';
import { applyMigrations } from '../src/migrate.js';
import { readDatabaseUrl } from '../src/read-database-url.js';
import { checkRunEvents } from './run-event-checks.js';
import { createTemporaryDatabase, dropTemporaryDatabase } from './temporary-database.js';

// Só o NOTIFY do passo ao vivo e o escutador (T4.4), num banco descartável: é o que o `make stream-mutants` roda contra
// cada cópia do pacote com a regra do aviso quebrada.
const TEMPORARY_DATABASE_PREFIX = 'ativada_run_event_';

function assertCondition(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

function reportCheck(message: string): void {
  process.stdout.write(`run-event-test: ${message}\n`);
}

async function runChecks(databaseUrl: string): Promise<void> {
  await applyMigrations({ databaseUrl, migrationsFolder: MIGRATIONS_FOLDER });
  const handle = openDatabase(databaseUrl);
  const client = new Bun.SQL(databaseUrl);
  try {
    await checkRunEvents({ handle, client, assertCondition, reportCheck }, databaseUrl);
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
    `run-event-test: FALHOU - ${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exitCode = 1;
}
