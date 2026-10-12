// Copyright (c) 2026 Ada Technology. All rights reserved.
import { runWithEnvironment } from '@ativada/environment';

import { createApplication } from './create-application.js';
import { loadEnvironment, type Environment } from './environment.js';
import { WORKSPACE_NAME } from './index.js';
import { createLogger } from './logging/logger.js';
import { UNEXPECTED_ERROR_LOG_MESSAGE } from './logging/logging.constant.js';
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
    stream: application.stream,
    host: environment.API_HOST,
    port: environment.API_PORT,
    reportUnexpectedError: (error) => logger.error(UNEXPECTED_ERROR_LOG_MESSAGE, { error }),
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
  // O boot da fila só depois de o encerramento estar armado: um SIGTERM logo depois de subir já devolve o que foi reivindicado.
  application
    .start()
    .catch((error: unknown) => logger.error(UNEXPECTED_ERROR_LOG_MESSAGE, { error }));
}

runWithEnvironment({ appName: WORKSPACE_NAME, load: loadEnvironment, run: startApplication });
