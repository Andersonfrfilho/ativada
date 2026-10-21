// Copyright (c) 2026 Ada Technology. All rights reserved.
import {
  createWorkerHeartbeatRepository,
  pingDatabase,
  readDatabaseHealth,
  type DatabaseHandle,
  type LatestWorkerHeartbeat,
} from '@ativada/database';

import { probeDatabaseWithin } from './database-probe.js';
import {
  toDatabaseHealthView,
  toWorkerHealth,
  UNKNOWN_WORKER_HEALTH,
  type DatabaseHealthView,
  type WorkerHealth,
} from './health-view.js';

// Teto próprio do `/v1/health` público: responde 503 sem derrubar o porteiro (ADR 0002, H1).
export const PUBLIC_HEALTH_PROBE_TIMEOUT_MILLISECONDS = 1_000;

export type HealthDependencies = {
  readonly probeDatabase: () => Promise<boolean>;
  readonly readDatabaseHealthView: () => DatabaseHealthView;
  readonly readWorkerHealth: () => Promise<WorkerHealth>;
};

export type HealthSources = {
  // `SELECT 1` pelo porteiro: `false` quando falha, nunca lança.
  readonly ping: () => Promise<boolean>;
  readonly readDatabaseHealth: () => Parameters<typeof toDatabaseHealthView>[0];
  readonly findLatestHeartbeat: () => Promise<LatestWorkerHeartbeat | undefined>;
  readonly heartbeatSeconds: number;
};

export function createHealthDependencies(sources: HealthSources): HealthDependencies {
  return {
    probeDatabase: () =>
      probeDatabaseWithin({
        check: sources.ping,
        timeoutMilliseconds: PUBLIC_HEALTH_PROBE_TIMEOUT_MILLISECONDS,
      }),
    readDatabaseHealthView: () => toDatabaseHealthView(sources.readDatabaseHealth()),
    // Sem conseguir ler o banco o estado é `unknown`, nunca erro: o admin precisa ver o resto.
    readWorkerHealth: async (): Promise<WorkerHealth> => {
      try {
        return toWorkerHealth({
          heartbeat: await sources.findLatestHeartbeat(),
          heartbeatSeconds: sources.heartbeatSeconds,
        });
      } catch {
        return UNKNOWN_WORKER_HEALTH;
      }
    },
  };
}

export function createDatabaseHealthDependencies(
  database: DatabaseHandle,
  heartbeatSeconds: number,
): HealthDependencies {
  return createHealthDependencies({
    ping: () => pingDatabase(database),
    readDatabaseHealth: () => readDatabaseHealth(database),
    findLatestHeartbeat: () => createWorkerHeartbeatRepository(database).findLatest(),
    heartbeatSeconds,
  });
}
