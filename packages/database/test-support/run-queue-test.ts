// Copyright (c) 2026 Ada Technology. All rights reserved.
import { MIGRATIONS_FOLDER } from '../src/database.constant.js';
import { closeDatabase, openDatabase } from '../src/database-handle.js';
import { applyMigrations } from '../src/migrate.js';
import { readDatabaseUrl } from '../src/read-database-url.js';
import { checkLiveRuns } from './live-run-checks.js';
import { checkRunQueueClaims } from './run-queue-checks.js';
import { checkRunQueueLifecycle } from './run-queue-lifecycle-checks.js';
import { checkRunQueueReading } from './run-queue-reading-checks.js';
import { createTemporaryDatabase, dropTemporaryDatabase } from './temporary-database.js';

// Só a fila de execuções (T3.6), num banco descartável: é o que o `make queue-mutants` roda contra cada cópia do
// pacote com uma regra da fila quebrada.
const TEMPORARY_DATABASE_PREFIX = 'ativada_run_queue_';

function assertCondition(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

function reportCheck(message: string): void {
  process.stdout.write(`run-queue-test: ${message}\n`);
}

async function runChecks(databaseUrl: string): Promise<void> {
  await applyMigrations({ databaseUrl, migrationsFolder: MIGRATIONS_FOLDER });
  const handle = openDatabase(databaseUrl);
  const client = new Bun.SQL(databaseUrl);
  try {
    const context = { handle, client, assertCondition, reportCheck };
    await checkRunQueueClaims(context);
    await checkRunQueueLifecycle(context);
    await checkRunQueueReading(context);
    await checkLiveRuns(context);
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
    `run-queue-test: FALHOU - ${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exitCode = 1;
}
