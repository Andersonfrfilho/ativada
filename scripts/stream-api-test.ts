// Copyright (c) 2026 Ada Technology. All rights reserved.
import { MIGRATIONS_FOLDER } from '../packages/database/src/database.constant.js';
import { applyMigrations } from '../packages/database/src/migrate.js';
import { readDatabaseUrl } from '../packages/database/src/read-database-url.js';
import {
  createTemporaryDatabase,
  dropTemporaryDatabase,
} from '../packages/database/test-support/temporary-database.js';
import { checkDelivery } from './stream-api-test/check-delivery.js';
import { checkHandshake } from './stream-api-test/check-handshake.js';
import { checkLifecycle } from './stream-api-test/check-lifecycle.js';
import { checkMarket } from './stream-api-test/check-market.js';
import { checkResync } from './stream-api-test/check-resync.js';
import { checkShutdown } from './stream-api-test/check-shutdown.js';
import { createStreamApiContext } from './stream-api-test/stream-api-context.js';
import { TEMPORARY_DATABASE_PREFIX } from './stream-api-test/stream-api-test.constant.js';

async function runChecks(databaseUrl: string): Promise<void> {
  await applyMigrations({ databaseUrl, migrationsFolder: MIGRATIONS_FOLDER });
  const context = await createStreamApiContext(databaseUrl);
  try {
    const delivery = await checkDelivery(context);
    await checkResync(context, delivery);
    delivery.sockets.a.socket.close();
    delivery.sockets.b.socket.close();
    await checkHandshake(context);
    await checkMarket(context);
    await checkLifecycle(context);
    await checkShutdown(context);
  } finally {
    await context.stop();
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
  process.stdout.write('stream-api-test: OK\n');
}

try {
  await main();
} catch (error: unknown) {
  process.stderr.write(
    `stream-api-test: FALHOU - ${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exitCode = 1;
}
