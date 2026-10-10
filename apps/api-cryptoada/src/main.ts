// Copyright (c) 2026 Ada Technology. All rights reserved.
import { runWithEnvironment } from '@cryptoada/environment';

import { createApplication } from './create-application.js';
import { loadEnvironment, type Environment } from './environment.js';
import { WORKSPACE_NAME } from './index.js';
import { createLogger } from './logging/logger.js';
import { startServer } from './server.js';
import {
  SHUTDOWN_TIMEOUT_MILLISECONDS,
  createShutdownHandler,
  registerShutdownSignals,
} from './shutdown.js';

function startApplication(environment: Environment): void {
  const logger = createLogger({
    appName: WORKSPACE_NAME,
    write: (line) => process.stdout.write(line),
  });
  const application = createApplication({ environment, logger });
  const server = startServer({
    handler: application.handler,
    host: environment.API_HOST,
    port: environment.API_PORT,
    reportUnexpectedError: (error) => logger.error('unexpected error', { error }),
  });
  logger.info('listening', { env: environment.ENV, host: environment.API_HOST, port: server.port });
  registerShutdownSignals(
    createShutdownHandler({
      stopServer: server.stop,
      closeResources: application.closeResources,
      logger,
      timeoutMilliseconds: SHUTDOWN_TIMEOUT_MILLISECONDS,
      exit: (code) => process.exit(code),
    }),
  );
}

runWithEnvironment({ appName: WORKSPACE_NAME, load: loadEnvironment, run: startApplication });
