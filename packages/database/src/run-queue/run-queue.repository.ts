// Copyright (c) 2026 Ada Technology. All rights reserved.
import { readOpenDatabase, type DatabaseHandle } from '../database-handle.js';
import { claimNextRun } from './run-claim.js';
import {
  countActiveRuns,
  countQueuedRuns,
  findQueuePosition,
  readOwnerRunLimits,
  readQueueSummary,
} from './run-queue-reading.js';
import type { RunQueueRepository } from './run-queue.types.js';
import {
  cancelRunsOfInactiveOwners,
  reclaimExpiredRuns,
  releaseClaimedRuns,
  renewHeartbeat,
} from './run-recovery.js';

// A fila É o banco (ADR 0002, T3.6): nenhuma estrutura em memória decide quem roda. Quem reivindica, recupera e libera
// não tem dono (é o processo da API); quem lê por usuário recebe o `OwnerScope` e filtra por ele.
export function createRunQueueRepository(handle: DatabaseHandle): RunQueueRepository {
  const { database } = readOpenDatabase(handle);
  return {
    claimNextRun: (params) => claimNextRun(database, params),
    renewHeartbeat: (params) => renewHeartbeat(database, params),
    reclaimExpiredRuns: (params) => reclaimExpiredRuns(database, params),
    releaseClaimedRuns: (params) => releaseClaimedRuns(database, params),
    cancelRunsOfInactiveOwners: () => cancelRunsOfInactiveOwners(database),
    countQueuedRuns: (scope) => countQueuedRuns(database, scope),
    countActiveRuns: (scope, kind) => countActiveRuns(database, scope, kind),
    readUserRunLimits: (scope) => readOwnerRunLimits(database, scope),
    findQueuePosition: (scope, runId) => findQueuePosition(database, scope, runId),
    readQueueSummary: () => readQueueSummary(database),
  };
}
