// Copyright (c) 2026 Ada Technology. All rights reserved.
import { sql } from 'drizzle-orm';
import {
  check,
  index,
  type CheckBuilder,
  type ExtraConfigColumn,
  type IndexBuilder,
} from 'drizzle-orm/pg-core';

import { RUN_STATUS } from '../runs/run.constant.js';
import { literalList } from './check-literals.js';

type RunQueueColumns = {
  readonly id: ExtraConfigColumn;
  readonly userId: ExtraConfigColumn;
  readonly status: ExtraConfigColumn;
  readonly claimedBy: ExtraConfigColumn;
  readonly heartbeatAt: ExtraConfigColumn;
  readonly createdAt: ExtraConfigColumn;
  readonly startedAt: ExtraConfigColumn;
};

// Índices e CHECK da fila de execuções (T3.6, migration 0012): a fila `queued` por antiguidade, os `running` por batimento
// (órfãs), o último início por usuário (round-robin) e a posse (`claimed_by`) só em execução `running`.
export function runQueueConstraints(
  table: RunQueueColumns,
): readonly (IndexBuilder | CheckBuilder)[] {
  return [
    index('runs_queued_created_at_idx')
      .on(table.createdAt, table.id)
      .where(sql`${table.status} = ${literalList([RUN_STATUS.QUEUED])}`),
    index('runs_running_heartbeat_idx')
      .on(table.heartbeatAt)
      .where(sql`${table.status} = ${literalList([RUN_STATUS.RUNNING])}`),
    index('runs_user_id_started_at_idx')
      .on(table.userId, table.startedAt.desc())
      .where(sql`${table.startedAt} is not null`),
    check(
      'runs_claim_only_when_running_check',
      sql`${table.claimedBy} is null or ${table.status} = ${literalList([RUN_STATUS.RUNNING])}`,
    ),
  ];
}
