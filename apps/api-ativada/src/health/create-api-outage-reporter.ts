// Copyright (c) 2026 Ada Technology. All rights reserved.
import {
  createDatabaseOutageGuard,
  readDatabaseHealth,
  type DatabaseHandle,
} from '@ativada/database';

import type { Logger } from '../logging/logger.js';

export type ApiOutageReporter = {
  readonly reportOutage: (error: unknown) => void;
  readonly reportRecovery: () => void;
};

export type CreateApiOutageReporterParams = {
  readonly database: DatabaseHandle;
  readonly logger: Logger;
};

// A API tem um resumo só, como cada laço do worker: banco fora = no máximo uma linha por minuto, só com o código.
export function createApiOutageReporter(params: CreateApiOutageReporterParams): ApiOutageReporter {
  const { database, logger } = params;
  const guard = createDatabaseOutageGuard({
    readHealth: () => readDatabaseHealth(database),
    now: Date.now,
    write: (entry) => {
      if (entry.level === 'error') logger.error(entry.message, entry.fields);
      else logger.info(entry.message, entry.fields);
    },
  });
  return {
    reportOutage: (error): void => {
      guard.handleFailure(error);
    },
    // Só vale como volta depois de uma consulta que passou pelo porteiro; uma resposta que nem tocou o banco não conta.
    reportRecovery: (): void => {
      if (readDatabaseHealth(database).state === 'up') guard.handleSuccess();
    },
  };
}
