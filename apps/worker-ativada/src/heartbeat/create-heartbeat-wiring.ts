// Copyright (c) 2026 Ada Technology. All rights reserved.
import {
  createWorkerHeartbeatRepository,
  type DatabaseHandle,
  type JsonContainer,
} from '@ativada/database';
import { MILLISECONDS_PER_SECOND } from '@ativada/environment';

import type { Environment } from '../environment.js';
import type { WorkerLogger } from '../logging/worker-logger.js';
import { createLoopOutageGuard } from '../outage/loop-outage-guard.js';
import { createHeartbeatLoop, type HeartbeatLoop } from './heartbeat-loop.js';

export type CreateHeartbeatWiringParams = {
  readonly database: DatabaseHandle;
  readonly logger: WorkerLogger;
  readonly environment: Pick<Environment, 'WORKER_HEARTBEAT_SECONDS'>;
  // O resumo das equipes de modelo (RF23); ausente = o batimento não leva esse bloco.
  readonly readModelTeams?: (() => JsonContainer) | undefined;
};

// A instância é sorteada no boot (ADR 0002, H3): um worker reiniciado é outra linha, e a mais nova vale.
export function createHeartbeatWiring(params: CreateHeartbeatWiringParams): HeartbeatLoop {
  const repository = createWorkerHeartbeatRepository(params.database);
  const instanceId = `worker-${Bun.randomUUIDv7()}`;
  return createHeartbeatLoop({
    recordBeat: () =>
      repository.recordBeat({
        instanceId,
        version: undefined,
        modelTeams: params.readModelTeams?.(),
      }),
    logger: params.logger,
    intervalMilliseconds: params.environment.WORKER_HEARTBEAT_SECONDS * MILLISECONDS_PER_SECOND,
    outage: createLoopOutageGuard({ database: params.database, logger: params.logger }),
  });
}
