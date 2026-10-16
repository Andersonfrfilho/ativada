// Copyright (c) 2026 Ada Technology. All rights reserved.
import { and, desc, eq, lt, type SQL } from 'drizzle-orm';

import type { DatabaseExecutor } from '../database-executor.js';
import { readOpenDatabase, type DatabaseHandle } from '../database-handle.js';
import { toNullableJsonb } from '../jsonb.js';
import { ownerCondition, type OwnerScope } from '../ownership/owner-scope.js';
import { analystDecisions } from '../schema/analyst-decisions.schema.js';
import { ANALYST_DECISION_PAGE_MAXIMUM_SIZE } from './analyst-decision.constant.js';
import {
  ANALYST_DECISION_COLUMNS,
  toAnalystDecisionRecord,
} from './analyst-decision-record.mapper.js';
import { readAnalystHistory } from './analyst-history.js';
import type {
  AnalystDecisionRecord,
  AnalystDecisionRepository,
  AnalystDecisionsPage,
  InsertAnalystDecision,
  ListAnalystDecisionsParams,
} from './analyst-decision.types.js';

function ownedRun(scope: OwnerScope, runId: string): SQL | undefined {
  return and(ownerCondition(scope, analystDecisions.userId), eq(analystDecisions.runId, runId));
}

export const insertAnalystDecision: InsertAnalystDecision = async (executor, scope, input) => {
  const inserted = await executor
    .insert(analystDecisions)
    .values({
      id: Bun.randomUUIDv7(),
      userId: scope.ownerUserId,
      runId: input.runId,
      candleTime: input.candleTime,
      version: input.version,
      mode: input.mode,
      status: input.status,
      posture: input.posture,
      reason: input.reason,
      cadenceMinutes: input.cadenceMinutes,
      entryGate: input.entryGate,
      riskScale: input.riskScale,
      isTimeExitDue: input.isTimeExitDue,
      forecast: toNullableJsonb(input.forecast),
      readings: toNullableJsonb(input.readings),
      specialists: toNullableJsonb(input.specialists),
      locks: toNullableJsonb(input.locks),
      commands: toNullableJsonb(input.commands),
      message: input.message,
      failureCode: input.failureCode,
    })
    .onConflictDoNothing({ target: [analystDecisions.runId, analystDecisions.candleTime] })
    .returning({ id: analystDecisions.id });
  return inserted.length > 0;
};

async function findDecision(
  executor: DatabaseExecutor,
  scope: OwnerScope,
  params: { readonly runId: string; readonly candleTime: number },
): Promise<AnalystDecisionRecord | undefined> {
  const rows = await executor
    .select(ANALYST_DECISION_COLUMNS)
    .from(analystDecisions)
    .where(and(ownedRun(scope, params.runId), eq(analystDecisions.candleTime, params.candleTime)))
    .limit(1);
  const row = rows[0];
  return row === undefined ? undefined : toAnalystDecisionRecord(row);
}

async function listPage(
  executor: DatabaseExecutor,
  scope: OwnerScope,
  params: ListAnalystDecisionsParams,
): Promise<AnalystDecisionsPage> {
  const limit = Math.min(Math.max(Math.trunc(params.limit), 1), ANALYST_DECISION_PAGE_MAXIMUM_SIZE);
  const rows = await executor
    .select(ANALYST_DECISION_COLUMNS)
    .from(analystDecisions)
    .where(
      and(
        ownedRun(scope, params.runId),
        params.before === undefined ? undefined : lt(analystDecisions.candleTime, params.before),
      ),
    )
    .orderBy(desc(analystDecisions.candleTime))
    .limit(limit + 1);
  const page = rows.slice(0, limit);
  const last = page.at(-1);
  return {
    decisions: page.map(toAnalystDecisionRecord),
    nextCursor: rows.length > limit && last !== undefined ? last.candleTime : undefined,
  };
}

export function createAnalystDecisionRepository(handle: DatabaseHandle): AnalystDecisionRepository {
  const { database } = readOpenDatabase(handle);
  return {
    appendAnalystDecision: (scope, input) => insertAnalystDecision(database, scope, input),
    findAnalystDecision: (scope, params) => findDecision(database, scope, params),
    findLatestAnalystDecision: async (scope, runId) =>
      (await listPage(database, scope, { runId, limit: 1, before: undefined })).decisions[0],
    listAnalystDecisionsPage: (scope, params) => listPage(database, scope, params),
    readAnalystHistory: (scope, params) => readAnalystHistory(database, scope, params),
  };
}
