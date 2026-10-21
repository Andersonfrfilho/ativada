// Copyright (c) 2026 Ada Technology. All rights reserved.
import { MIGRATIONS_FOLDER } from '../src/database.constant.js';
import { closeDatabase, openDatabase } from '../src/database-handle.js';
import { applyMigrations } from '../src/migrate.js';
import { readDatabaseUrl } from '../src/read-database-url.js';
import { checkRunStall } from './run-stall-checks.js';
import { checkRunStallSweep } from './run-stall-sweep-checks.js';
import { createTemporaryDatabase, dropTemporaryDatabase } from './temporary-database.js';

// Só a parada da simulação ao vivo (spec 006, Fase 2), num banco descartável: é o que o `make stall-mutants` roda contra
// cada cópia do pacote com uma regra da varredura quebrada.
const TEMPORARY_DATABASE_PREFIX = 'ativada_run_stall_';

function assertCondition(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

function reportCheck(message: string): void {
  process.stdout.write(`run-stall-test: ${message}\n`);
}

async function runChecks(databaseUrl: string): Promise<void> {
  await applyMigrations({ databaseUrl, migrationsFolder: MIGRATIONS_FOLDER });
  const handle = openDatabase(databaseUrl);
  const client = new Bun.SQL(databaseUrl);
  try {
    const context = { handle, client, assertCondition, reportCheck };
    await checkRunStall(context);
    await checkRunStallSweep(context, databaseUrl);
  } finally {
    await client.close();
    await closeDatabase(handle);
  }
}

async function main(): Promise<void> {
  const adminUrl = readDatabaseUrl();
  const temporary = await createTemporaryDatabase(adminUrl, TEMPORARY_DATABASE_PREFIX);
  try {
    await runChecks(temporary.url);
  } finally {
    await dropTemporaryDatabase(adminUrl, temporary.databaseName);
  }
  reportCheck('OK');
}

try {
  await main();
} catch (error: unknown) {
  process.stderr.write(
    `run-stall-test: FALHOU - ${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exitCode = 1;
}
