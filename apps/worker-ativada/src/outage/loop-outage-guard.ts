// Copyright (c) 2026 Ada Technology. All rights reserved.
import {
  createDatabaseOutageGuard,
  readDatabaseHealth,
  type DatabaseHandle,
} from '@ativada/database';

import type { WorkerLogger } from '../logging/worker-logger.js';

export type LoopOutageGuard = ReturnType<typeof createDatabaseOutageGuard>;

export type CreateLoopOutageGuardParams = {
  readonly database: DatabaseHandle;
  readonly logger: WorkerLogger;
};

// Cada laço tem a sua guarda e o seu resumo: banco fora = no máximo uma linha por minuto por laço, sempre com `code`.
export function createLoopOutageGuard(params: CreateLoopOutageGuardParams): LoopOutageGuard {
  const { database, logger } = params;
  return createDatabaseOutageGuard({
    readHealth: () => readDatabaseHealth(database),
    now: Date.now,
    write: (entry) => {
      if (entry.level === 'error') logger.error(entry.message, entry.fields);
      else logger.info(entry.message, entry.fields);
    },
  });
}
