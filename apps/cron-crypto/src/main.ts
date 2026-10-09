// Copyright (c) 2026 Ada Technology. All rights reserved.
import { closeDatabase, openDatabase } from '@crypto/database';
import { runWithEnvironment } from '@crypto/environment';

import { createProductionPurgeTask } from './accounts/create-purge-deleted-accounts-task.js';
import { EXIT_CODE, type ExitCode } from './cron.constant.js';
import { loadEnvironment, type Environment } from './environment.js';
import { WORKSPACE_NAME } from './index.js';
import { createCronLogger } from './logging/cron-logger.js';

async function purgeDeletedAccounts(environment: Environment): Promise<ExitCode> {
  const logger = createCronLogger({
    appName: WORKSPACE_NAME,
    write: (line) => process.stdout.write(line),
  });
  const database = openDatabase(environment.DATABASE_URL);
  try {
    const summary = await createProductionPurgeTask({ environment, database, logger })();
    logger.info('purge-deleted-accounts finished', { env: environment.ENV, ...summary });
    return summary.failures > 0 ? EXIT_CODE.FAILURE : EXIT_CODE.SUCCESS;
  } catch (error: unknown) {
    const errorName = error instanceof Error ? error.name : 'UnknownError';
    logger.error('purge-deleted-accounts failed', { env: environment.ENV, errorName });
    return EXIT_CODE.FAILURE;
  } finally {
    await closeDatabase(database);
  }
}

async function execute(environment: Environment): Promise<void> {
  process.exitCode = await purgeDeletedAccounts(environment);
}

// execute nunca rejeita: purgeDeletedAccounts captura o erro e devolve o código de saída.
runWithEnvironment({
  appName: WORKSPACE_NAME,
  load: loadEnvironment,
  run: (environment) => void execute(environment),
});
