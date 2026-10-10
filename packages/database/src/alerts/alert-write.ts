// Copyright (c) 2026 Ada Technology. All rights reserved.
import { and, eq, isNotNull, isNull } from 'drizzle-orm';

import type { DatabaseExecutor } from '../database-executor.js';
import { toJsonb } from '../jsonb.js';
import type { UserId } from '../ownership/user-id.js';
import type { WriteRequest } from '../run-results/run-result-write.types.js';
import { alerts } from '../schema/alerts.schema.js';
import { users } from '../schema/users.schema.js';
import { ALERT_CHANNEL } from './alert.constant.js';
import type { AlertInput } from './alert.types.js';

// Dono com Telegram vinculado e alertas ligados, conta ativa: só a ele o passo enfileira alerta.
export async function isTelegramDeliverable(
  executor: DatabaseExecutor,
  ownerUserId: UserId,
): Promise<boolean> {
  const rows = await executor
    .select({ id: users.id })
    .from(users)
    .where(
      and(
        eq(users.id, ownerUserId),
        isNotNull(users.telegramChatId),
        eq(users.alertTelegramEnabled, true),
        isNull(users.deletedAt),
        isNull(users.blockedAt),
      ),
    )
    .limit(1);
  return rows.length > 0;
}

// A chave (execução, candle, lado, canal) repetida é ignorada: o alerta de um candle nasce uma vez só.
export async function writeAlerts(request: WriteRequest<AlertInput>): Promise<number> {
  const { executor, ownerUserId, runId, rows } = request;
  if (rows.length === 0) return 0;
  if (!(await isTelegramDeliverable(executor, ownerUserId))) return 0;
  const inserted = await executor
    .insert(alerts)
    .values(
      rows.map((row) => ({
        id: Bun.randomUUIDv7(),
        userId: ownerUserId,
        runId,
        candleTime: row.candleTime,
        side: row.side,
        channel: ALERT_CHANNEL.TELEGRAM,
        payload: toJsonb(row.payload),
      })),
    )
    .onConflictDoNothing({
      target: [alerts.runId, alerts.candleTime, alerts.side, alerts.channel],
    })
    .returning({ id: alerts.id });
  return inserted.length;
}
