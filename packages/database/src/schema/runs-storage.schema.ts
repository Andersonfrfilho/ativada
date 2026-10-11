// Copyright (c) 2026 Ada Technology. All rights reserved.
import { sql } from 'drizzle-orm';
import {
  check,
  index,
  type CheckBuilder,
  type ExtraConfigColumn,
  type IndexBuilder,
} from 'drizzle-orm/pg-core';

import { TERMINAL_RUN_STATUSES } from '../runs/run.constant.js';
import { literalList } from './check-literals.js';
import { runWaitConstraints } from './runs-wait.schema.js';

type RunStorageColumns = {
  readonly userId: ExtraConfigColumn;
  readonly status: ExtraConfigColumn;
  readonly deletedAt: ExtraConfigColumn;
};

// Exclusão lógica da execução (migration 0021): o índice conta as guardadas do dono (a cota) e só a terminada se apaga.
export function runStorageConstraints(
  table: RunStorageColumns,
): readonly (IndexBuilder | CheckBuilder)[] {
  return [
    index('runs_user_id_stored_idx')
      .on(table.userId)
      .where(sql`${table.deletedAt} is null`),
    check(
      'runs_deleted_is_terminal_check',
      sql`${table.deletedAt} is null or ${table.status} in (${literalList(TERMINAL_RUN_STATUSES)})`,
    ),
  ];
}

// A espera por dado (migration 0016) e a exclusão lógica (0021): as restrições do ciclo de vida da execução depois do fim.
export function runLifecycleConstraints(
  table: RunStorageColumns & Parameters<typeof runWaitConstraints>[0],
): readonly (IndexBuilder | CheckBuilder)[] {
  return [...runWaitConstraints(table), ...runStorageConstraints(table)];
}
