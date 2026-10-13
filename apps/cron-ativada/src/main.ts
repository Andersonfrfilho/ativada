// Copyright (c) 2026 Ada Technology. All rights reserved.
import { closeDatabase, openDatabase } from '@ativada/database';
import { runWithEnvironment } from '@ativada/environment';

import { createProductionTasks } from './create-production-tasks.js';
import { type ExitCode } from './cron.constant.js';
import { loadEnvironment, type Environment } from './environment.js';
import { WORKSPACE_NAME } from './index.js';
import { createCronLogger } from './logging/cron-logger.js';
import { runCronTasks } from './run-cron-tasks.js';

async function runAllTasks(environment: Environment): Promise<ExitCode> {
  const logger = createCronLogger({
    appName: WORKSPACE_NAME,
    write: (line) => process.stdout.write(line),
  });
  const database = openDatabase(environment.DATABASE_URL, {
    sslRootCertificate: environment.DATABASE_SSL_ROOT_CERT,
    queryTimeoutSeconds: environment.DATABASE_LONG_QUERY_TIMEOUT_SECONDS,
  });
  try {
    return await runCronTasks(createProductionTasks({ environment, database, logger }), logger);
  } finally {
    await closeDatabase(database);
  }
}

async function execute(environment: Environment): Promise<void> {
  process.exitCode = await runAllTasks(environment);
}

// execute nunca rejeita: runCronTasks captura o erro de cada tarefa e devolve o código de saída.
runWithEnvironment({
  appName: WORKSPACE_NAME,
  load: loadEnvironment,
  run: (environment) => void execute(environment),
});
