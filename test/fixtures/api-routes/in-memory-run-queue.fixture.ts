// Copyright (c) 2026 Ada Technology. All rights reserved.
import { readUserRunLimits } from '../../../packages/database/src/run-queue/run-limits.js';
import { CLAIMABLE_RUN_KINDS } from '../../../packages/database/src/run-queue/run-queue.constant.js';
import type { RunQueueRepository } from '../../../packages/database/src/run-queue/run-queue.types.js';
import { RUN_STATUS } from '../../../packages/database/src/runs/run.constant.js';
import type { InMemoryRuns } from './in-memory-runs.fixture.js';

export type InMemoryRunQueue = {
  readonly port: Pick<
    RunQueueRepository,
    'countQueuedRuns' | 'countActiveRuns' | 'readUserRunLimits' | 'findQueuePosition'
  >;
  // `users.limits` bruto de cada dono, como o banco o devolve.
  readonly limits: Map<string, unknown>;
};

// O lado de LEITURA da fila contra as execuções em memória: contagens, tetos e posição, sempre do dono.
export function createInMemoryRunQueue(runs: Pick<InMemoryRuns, 'owned'>): InMemoryRunQueue {
  const limits = new Map<string, unknown>();
  const queuedInOrder = (): ReturnType<InMemoryRuns['owned']> =>
    runs
      .owned()
      .filter(
        (stored) =>
          stored.record.status === RUN_STATUS.QUEUED &&
          CLAIMABLE_RUN_KINDS.includes(stored.record.kind),
      )
      .sort((first, second) => first.sequence - second.sequence);
  const port: InMemoryRunQueue['port'] = {
    countQueuedRuns: (scope) =>
      Promise.resolve(
        runs
          .owned()
          .filter(
            (stored) =>
              stored.userId === scope.ownerUserId &&
              stored.record.status === RUN_STATUS.QUEUED &&
              CLAIMABLE_RUN_KINDS.includes(stored.record.kind),
          ).length,
      ),
    countActiveRuns: (scope, kind) =>
      Promise.resolve(
        runs
          .owned()
          .filter(
            (stored) =>
              stored.userId === scope.ownerUserId &&
              stored.record.kind === kind &&
              (stored.record.status === RUN_STATUS.QUEUED ||
                stored.record.status === RUN_STATUS.RUNNING),
          ).length,
      ),
    readUserRunLimits: (scope) => Promise.resolve(readUserRunLimits(limits.get(scope.ownerUserId))),
    findQueuePosition: (scope, runId) => {
      const queued = queuedInOrder();
      const overall = queued.findIndex((stored) => stored.record.id === runId);
      const found = queued[overall];
      if (found === undefined || found.userId !== scope.ownerUserId)
        return Promise.resolve(undefined);
      const own = queued
        .filter((stored) => stored.userId === scope.ownerUserId)
        .findIndex((stored) => stored.record.id === runId);
      return Promise.resolve({ own: own + 1, overall: overall + 1 });
    },
  };
  return { port, limits };
}
