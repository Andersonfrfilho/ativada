// Copyright (c) 2026 Ada Technology. All rights reserved.
import { index, pgTable, timestamp, varchar } from 'drizzle-orm/pg-core';

import {
  WORKER_HEARTBEAT_INSTANCE_ID_MAX_LENGTH,
  WORKER_HEARTBEAT_VERSION_MAX_LENGTH,
} from '../worker-heartbeats/worker-heartbeat.constant.js';

// O batimento do processo do worker (ADR 0002, H3): uma linha por instância, sorteada no boot, sem dado de usuário.
// `last_beat_at` vem do relógio do banco, nunca da máquina do worker, para a API comparar idade com o mesmo relógio.
export const workerHeartbeats = pgTable(
  'worker_heartbeats',
  {
    instanceId: varchar('instance_id', {
      length: WORKER_HEARTBEAT_INSTANCE_ID_MAX_LENGTH,
    }).primaryKey(),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
    lastBeatAt: timestamp('last_beat_at', { withTimezone: true }).notNull().defaultNow(),
    version: varchar('version', { length: WORKER_HEARTBEAT_VERSION_MAX_LENGTH }),
  },
  (table) => [index('worker_heartbeats_last_beat_at_idx').on(table.lastBeatAt.desc())],
);
