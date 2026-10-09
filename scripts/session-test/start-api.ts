// Copyright (c) 2026 Ada Technology. All rights reserved.
import { createApplication } from '../../apps/api-crypto/src/create-application.js';
import { loadEnvironment, type Environment } from '../../apps/api-crypto/src/environment.js';
import { createLogger } from '../../apps/api-crypto/src/logging/logger.js';
import { startServer } from '../../apps/api-crypto/src/server.js';

export type RunningApi = {
  readonly environment: Environment;
  readonly baseUrl: string;
  readonly logLines: string[];
  readonly stop: () => Promise<void>;
};

export function startApi(): RunningApi {
  const environment = loadEnvironment();
  const logLines: string[] = [];
  const logger = createLogger({
    appName: 'api-crypto-session-test',
    write: (line) => void logLines.push(line),
  });
  const application = createApplication({ environment, logger });
  const server = startServer({
    handler: application.handler,
    host: environment.API_HOST,
    port: environment.API_PORT,
    reportUnexpectedError: (error) => logger.error('unexpected error', { error }),
  });
  return {
    environment,
    baseUrl: `http://${environment.API_HOST}:${server.port}`,
    logLines,
    stop: async (): Promise<void> => {
      await server.stop();
      await application.closeResources();
    },
  };
}
