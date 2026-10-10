// Copyright (c) 2026 Ada Technology. All rights reserved.
import { and, eq, isNotNull, isNull } from 'drizzle-orm';

import type { DatabaseExecutor } from '../database-executor.js';
import type { GoalRunOutcome } from '../goals/goal.constant.js';
import { ownerCondition, type OwnerScope } from '../ownership/owner-scope.js';
import { runs } from '../schema/runs.schema.js';
import { RUN_STATUS } from './run.constant.js';

export type RecordGoalOutcomeParams = {
  readonly runId: string;
  readonly outcome: GoalRunOutcome;
  // Abertura do candle em cujo fechamento a meta foi decidida.
  readonly candleTime: number;
};

// O desfecho da meta é gravado UMA vez: só uma execução ao vivo `running`, atrelada a uma meta e ainda sem desfecho aceita.
// Repetir (retomada, reentrega) não muda nada e devolve `false`.
export async function recordGoalOutcome(
  executor: DatabaseExecutor,
  scope: OwnerScope,
  params: RecordGoalOutcomeParams,
): Promise<boolean> {
  const rows = await executor
    .update(runs)
    .set({ goalOutcome: params.outcome, goalOutcomeCandleTime: params.candleTime })
    .where(
      and(
        ownerCondition(scope, runs.userId),
        eq(runs.id, params.runId),
        eq(runs.status, RUN_STATUS.RUNNING),
        isNotNull(runs.goalId),
        isNull(runs.goalOutcome),
      ),
    )
    .returning({ id: runs.id });
  return rows.length > 0;
}
