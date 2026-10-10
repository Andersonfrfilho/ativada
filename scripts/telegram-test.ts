// Copyright (c) 2026 Ada Technology. All rights reserved.
import { MIGRATIONS_FOLDER } from '../packages/database/src/database.constant.js';
import { applyMigrations } from '../packages/database/src/migrate.js';
import { readDatabaseUrl } from '../packages/database/src/read-database-url.js';
import {
  createTemporaryDatabase,
  dropTemporaryDatabase,
} from '../packages/database/test-support/temporary-database.js';
import {
  cancelRun,
  closeLiveTestContext,
  createLiveTestContext,
  createLiveUser,
} from './live-test/live-test-context.js';
import { checkAtomicAlert } from './telegram-test/check-atomic.js';
import {
  checkDelivered,
  checkEnqueued,
  evaluateWithAlerts,
  startDeliveryRuns,
} from './telegram-test/check-delivery.js';
import { checkLgpd } from './telegram-test/check-lgpd.js';
import { checkLinkFlow } from './telegram-test/check-link.js';
import { checkLogs } from './telegram-test/check-logs.js';
import { checkRestartAndUnlink } from './telegram-test/check-restart.js';
import { checkRetryAndRaces } from './telegram-test/check-retry.js';
import {
  CHAT_OF_D,
  CHAT_OF_E,
  CHAT_OF_F,
  CHAT_OF_G,
  TEMPORARY_DATABASE_PREFIX,
} from './telegram-test/telegram-test.constant.js';
import {
  closeTelegramTestContext,
  createTelegramTestContext,
  linkChat,
  reportTelegramLine,
  type TelegramTestContext,
} from './telegram-test/telegram-test-context.js';

async function runChecks(context: TelegramTestContext): Promise<void> {
  const { live } = context;
  const [a, b, c, d, e, f, g] = await Promise.all(
    ['a', 'b', 'c', 'd', 'e', 'f', 'g'].map((name) => createLiveUser(live, name)),
  );
  if (!a || !b || !c || !d || !e || !f || !g) throw new Error('usuários de teste não criados');
  await checkLinkFlow(context, { a, b });
  await linkChat(d, { context: live, chatId: CHAT_OF_D, label: 'D' });
  await linkChat(e, { context: live, chatId: CHAT_OF_E, label: 'E' });
  await linkChat(f, { context: live, chatId: CHAT_OF_F, label: 'F' });
  await linkChat(g, { context: live, chatId: CHAT_OF_G, label: 'G' });
  const runs = await startDeliveryRuns(context, { a, b, c });
  await evaluateWithAlerts(context);
  const counts = await checkEnqueued(context, runs);
  await checkDelivered(context, counts);
  for (const [run, user] of [
    [runs.a, a],
    [runs.b, b],
    [runs.c, c],
  ] as const) {
    await cancelRun(live, { runId: run.id, user });
  }
  await checkRestartAndUnlink(context, { d, e });
  await checkAtomicAlert(context, g);
  await checkRetryAndRaces(context, f);
  await checkLgpd(context, { users: { a, b }, runs });
  await checkLogs(context);
}

async function main(): Promise<void> {
  const adminUrl = readDatabaseUrl();
  const temporary = await createTemporaryDatabase(adminUrl, TEMPORARY_DATABASE_PREFIX);
  try {
    await applyMigrations({ databaseUrl: temporary.url, migrationsFolder: MIGRATIONS_FOLDER });
    const live = await createLiveTestContext(temporary.url);
    const context = createTelegramTestContext(live);
    try {
      await runChecks(context);
    } finally {
      await closeTelegramTestContext(context);
      await closeLiveTestContext(live);
    }
  } finally {
    await dropTemporaryDatabase(adminUrl, temporary.databaseName);
  }
  reportTelegramLine('OK');
}

try {
  await main();
} catch (error: unknown) {
  process.stderr.write(
    `telegram-test: FALHOU - ${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exitCode = 1;
}
