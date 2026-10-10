// Copyright (c) 2026 Ada Technology. All rights reserved.
import { sql } from 'drizzle-orm';
import {
  check,
  foreignKey,
  index,
  type CheckBuilder,
  type ExtraConfigColumn,
  type ForeignKeyBuilder,
  type IndexBuilder,
} from 'drizzle-orm/pg-core';

import { GOAL_RUN_OUTCOME } from '../goals/goal.constant.js';
import { RUN_KIND } from '../runs/run.constant.js';
import { literalList } from './check-literals.js';
import { goals } from './goals.schema.js';

type RunGoalColumns = {
  readonly userId: ExtraConfigColumn;
  readonly kind: ExtraConfigColumn;
  readonly goalId: ExtraConfigColumn;
  readonly goalOutcome: ExtraConfigColumn;
  readonly goalOutcomeCandleTime: ExtraConfigColumn;
};

// FK composta (a meta é do mesmo dono), índice e CHECKs da simulação atrelada a uma meta (T4b.4, migration 0015): a meta só em simulação ao vivo, o desfecho só com
// meta, e o desfecho e o candle dele sempre juntos.
export function runGoalConstraints(
  table: RunGoalColumns,
): readonly (ForeignKeyBuilder | IndexBuilder | CheckBuilder)[] {
  return [
    foreignKey({
      name: 'runs_goal_id_user_id_fk',
      columns: [table.goalId, table.userId],
      foreignColumns: [goals.id, goals.userId],
    }).onDelete('restrict'),
    index('runs_goal_id_idx')
      .on(table.goalId)
      .where(sql`${table.goalId} is not null`),
    check(
      'runs_goal_outcome_check',
      sql`${table.goalOutcome} is null or ${table.goalOutcome} in (${literalList(Object.values(GOAL_RUN_OUTCOME))})`,
    ),
    check(
      'runs_goal_outcome_pair_check',
      sql`(${table.goalOutcome} is null) = (${table.goalOutcomeCandleTime} is null)`,
    ),
    check(
      'runs_goal_outcome_needs_goal_check',
      sql`${table.goalOutcome} is null or ${table.goalId} is not null`,
    ),
    check(
      'runs_goal_only_live_check',
      sql`${table.goalId} is null or ${table.kind} = ${literalList([RUN_KIND.LIVE_PAPER])}`,
    ),
  ];
}
