// Copyright (c) 2026 Ada Technology. All rights reserved.
import { MIGRATIONS_FOLDER } from '../packages/database/src/database.constant.js';
import { applyMigrations } from '../packages/database/src/migrate.js';
import { readDatabaseUrl } from '../packages/database/src/read-database-url.js';
import {
  createTemporaryDatabase,
  dropTemporaryDatabase,
} from '../packages/database/test-support/temporary-database.js';
import { checkFiringOnce, checkIsolationAndSymbols } from './price-alerts-test/check-firing.js';
import { checkOutage } from './price-alerts-test/check-outage.js';
import { checkPrivacy } from './price-alerts-test/check-privacy.js';
import { checkRearm, checkTwoInstances } from './price-alerts-test/check-races.js';
import {
  CHAT_OF_A,
  CHAT_OF_B,
  TEMPORARY_DATABASE_PREFIX,
} from './price-alerts-test/price-alerts-test.constant.js';
import {
  closePriceAlertsTestContext,
  createPriceAlertsTestContext,
  createPriceUser,
  reportLine,
  type PriceAlertsTestContext,
} from './price-alerts-test/price-alerts-test-context.js';

async function runChecks(context: PriceAlertsTestContext): Promise<void> {
  const a = await createPriceUser(context, 'a', CHAT_OF_A);
  const b = await createPriceUser(context, 'b', CHAT_OF_B);
  const withoutTelegram = await createPriceUser(context, 'c');
  await checkFiringOnce(context, { a, b });
  await checkIsolationAndSymbols(context, { a, b });
  await checkTwoInstances(context, a);
  await checkRearm(context, a);
  await checkOutage(context, withoutTelegram);
  await checkPrivacy(context, a);
}

async function main(): Promise<void> {
  const adminUrl = readDatabaseUrl();
  const temporary = await createTemporaryDatabase(adminUrl, TEMPORARY_DATABASE_PREFIX);
  try {
    await applyMigrations({ databaseUrl: temporary.url, migrationsFolder: MIGRATIONS_FOLDER });
    const context = await createPriceAlertsTestContext(temporary.url);
    try {
      await runChecks(context);
    } finally {
      await closePriceAlertsTestContext(context);
    }
  } finally {
    await dropTemporaryDatabase(adminUrl, temporary.databaseName);
  }
  reportLine('OK');
}

try {
  await main();
} catch (error: unknown) {
  process.stderr.write(
    `price-alerts-test: FALHOU - ${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exitCode = 1;
}
