// Copyright (c) 2026 Ada Technology. All rights reserved.
import { and, asc, eq, inArray, isNotNull, isNull, lte, or, sql } from 'drizzle-orm';

import { readOpenDatabase, type DatabaseHandle } from '../database-handle.js';
import { readJsonb } from '../jsonb.js';
import { alerts } from '../schema/alerts.schema.js';
import { users } from '../schema/users.schema.js';
import { ALERT_CLAIM_MAXIMUM_BATCH, ALERT_STATUS, type AlertSide } from './alert.constant.js';
import type { AlertRepository, ClaimAlertsParams, ClaimedAlert } from './alert.types.js';

type Database = ReturnType<typeof readOpenDatabase>['database'];

function isDue(now: Date): ReturnType<typeof and> {
  return and(
    eq(alerts.status, ALERT_STATUS.PENDING),
    lte(alerts.nextAttemptAt, now),
    or(isNull(alerts.lockedUntil), lte(alerts.lockedUntil, now)),
  );
}

async function readChats(
  database: Pick<Database, 'select'>,
  userIds: readonly string[],
): Promise<ReadonlyMap<string, string>> {
  const rows = await database
    .select({ id: users.id, chatId: users.telegramChatId })
    .from(users)
    .where(
      and(
        inArray(users.id, [...userIds]),
        isNotNull(users.telegramChatId),
        eq(users.alertTelegramEnabled, true),
        isNull(users.deletedAt),
        isNull(users.blockedAt),
      ),
    );
  const chats = new Map<string, string>();
  for (const row of rows) if (row.chatId !== null) chats.set(row.id, row.chatId);
  return chats;
}

async function claimDue(database: Database, params: ClaimAlertsParams): Promise<ClaimedAlert[]> {
  const limit = Math.min(Math.max(Math.trunc(params.limit), 1), ALERT_CLAIM_MAXIMUM_BATCH);
  return database.transaction(async (transaction) => {
    const due = await transaction
      .select({ id: alerts.id })
      .from(alerts)
      .where(isDue(params.now))
      .orderBy(asc(alerts.nextAttemptAt), asc(alerts.id))
      .limit(limit)
      .for('update', { skipLocked: true });
    if (due.length === 0) return [];
    const taken = await transaction
      .update(alerts)
      .set({
        lockedUntil: new Date(params.now.getTime() + params.leaseMilliseconds),
        attempts: sql`${alerts.attempts} + 1`,
      })
      .where(
        inArray(
          alerts.id,
          due.map((row) => row.id),
        ),
      )
      .returning();
    const chats = await readChats(transaction, [...new Set(taken.map((row) => row.userId))]);
    return taken
      .map((row) => ({
        id: row.id,
        runId: row.runId,
        candleTime: row.candleTime,
        side: row.side as AlertSide,
        payload: readJsonb(row.payload),
        attempts: row.attempts,
        chatId: chats.get(row.userId),
      }))
      .sort((first, second) => first.candleTime - second.candleTime);
  });
}

export function createAlertRepository(handle: DatabaseHandle): AlertRepository {
  const { database } = readOpenDatabase(handle);
  const pending = (alertId: string): ReturnType<typeof and> =>
    and(eq(alerts.id, alertId), eq(alerts.status, ALERT_STATUS.PENDING));
  return {
    claimDue: (params) => claimDue(database, params),
    markSent: async ({ alertId, now }): Promise<void> => {
      await database
        .update(alerts)
        .set({ status: ALERT_STATUS.SENT, sentAt: now, lockedUntil: null, lastError: null })
        .where(pending(alertId));
    },
    reschedule: async ({ alertId, nextAttemptAt, errorCode }): Promise<void> => {
      await database
        .update(alerts)
        .set({ nextAttemptAt, lockedUntil: null, lastError: errorCode })
        .where(pending(alertId));
    },
    markFailed: async ({ alertId, errorCode }): Promise<void> => {
      await database
        .update(alerts)
        .set({ status: ALERT_STATUS.FAILED, lockedUntil: null, lastError: errorCode })
        .where(pending(alertId));
    },
    markSkipped: async ({ alertId, errorCode }): Promise<void> => {
      await database
        .update(alerts)
        .set({ status: ALERT_STATUS.SKIPPED, lockedUntil: null, lastError: errorCode })
        .where(pending(alertId));
    },
  };
}
