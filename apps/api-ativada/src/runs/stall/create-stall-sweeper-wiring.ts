// Copyright (c) 2026 Ada Technology. All rights reserved.
import {
  createDatabaseOutageGuard,
  createRunStallRepository,
  readDatabaseHealth,
  type DatabaseHandle,
} from '@ativada/database';
import { MILLISECONDS_PER_SECOND } from '@ativada/environment';

import type { Environment } from '../../environment.js';
import type { Logger } from '../../logging/logger.js';
import { createIntervalTimers } from '../queue/interval-timers.js';
import { createStallSweepLoop, type StallSweepLoop } from './stall-sweep-loop.js';

export type CreateStallSweeperWiringParams = {
  readonly environment: Pick<Environment, 'LIVE_STALL_GRACE_MINUTES' | 'LIVE_STALL_SWEEP_SECONDS'>;
  readonly database: DatabaseHandle;
  readonly logger: Logger;
};

// A varredura de parada da API (spec 006, D9): o worker é justamente quem pode estar parado, então quem olha é a API.
export function createStallSweeperWiring(params: CreateStallSweeperWiringParams): StallSweepLoop {
  const { environment, database, logger } = params;
  const outage = createDatabaseOutageGuard({
    readHealth: () => readDatabaseHealth(database),
    now: Date.now,
    write: (entry) => {
      if (entry.level === 'error') logger.error(entry.message, entry.fields);
      else logger.info(entry.message, entry.fields);
    },
  });
  return createStallSweepLoop({
    store: createRunStallRepository(database),
    timers: createIntervalTimers(),
    logger,
    outage,
    now: Date.now,
    graceMinutes: environment.LIVE_STALL_GRACE_MINUTES,
    intervalMilliseconds: environment.LIVE_STALL_SWEEP_SECONDS * MILLISECONDS_PER_SECOND,
  });
}
