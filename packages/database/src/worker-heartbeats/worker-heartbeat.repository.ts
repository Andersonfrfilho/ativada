// Copyright (c) 2026 Ada Technology. All rights reserved.
import { desc, sql } from 'drizzle-orm';

import { readOpenDatabase, type DatabaseHandle } from '../database-handle.js';
import { workerHeartbeats } from '../schema/worker-heartbeats.schema.js';
import { WORKER_HEARTBEAT_RETENTION_HOURS } from './worker-heartbeat.constant.js';
import type {
  LatestWorkerHeartbeat,
  RecordWorkerBeatParams,
  WorkerHeartbeatRepository,
} from './worker-heartbeat.types.js';

const AGE_MILLISECONDS = sql<number>`(extract(epoch from (now() - ${workerHeartbeats.lastBeatAt})) * 1000)::double precision`;

// Dado operacional sem dono (não tem `user_id`): por isso o repositório não pede `OwnerScope`.
export function createWorkerHeartbeatRepository(handle: DatabaseHandle): WorkerHeartbeatRepository {
  const { database } = readOpenDatabase(handle);
  return {
    recordBeat: async (params: RecordWorkerBeatParams): Promise<void> => {
      await database
        .insert(workerHeartbeats)
        .values({ instanceId: params.instanceId, version: params.version ?? null })
        .onConflictDoUpdate({
          target: workerHeartbeats.instanceId,
          set: { lastBeatAt: sql`now()`, version: params.version ?? null },
        });
      await database
        .delete(workerHeartbeats)
        .where(
          sql`${workerHeartbeats.lastBeatAt} < now() - make_interval(hours => ${WORKER_HEARTBEAT_RETENTION_HOURS})`,
        );
    },
    findLatest: async (): Promise<LatestWorkerHeartbeat | undefined> => {
      const rows = await database
        .select({
          instanceId: workerHeartbeats.instanceId,
          lastBeatAt: workerHeartbeats.lastBeatAt,
          ageMilliseconds: AGE_MILLISECONDS,
        })
        .from(workerHeartbeats)
        .orderBy(desc(workerHeartbeats.lastBeatAt))
        .limit(1);
      return rows[0];
    },
  };
}
