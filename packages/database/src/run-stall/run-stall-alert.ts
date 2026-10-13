// Copyright (c) 2026 Ada Technology. All rights reserved.
import { and, eq, sql } from 'drizzle-orm';

import { isTelegramDeliverable } from '../alerts/alert-write.js';
import { ALERT_CHANNEL, ALERT_SIDE } from '../alerts/alert.constant.js';
import type { DatabaseExecutor } from '../database-executor.js';
import type { JsonContainer } from '../json-value.types.js';
import { toJsonb } from '../jsonb.js';
import { userIdFromDatabase } from '../ownership/user-id.js';
import { RUN_EVENT_KIND, RUN_EVENTS_CHANNEL } from '../run-events/run-event.constant.js';
import { alerts } from '../schema/alerts.schema.js';

export type StallAlertParams = {
  readonly userId: string;
  readonly runId: string;
  // Início do episódio: junto com o lado é a chave única do aviso (um STALL e um RESUME por episódio).
  readonly stalledSince: number;
  readonly side: typeof ALERT_SIDE.STALL | typeof ALERT_SIDE.RESUME;
  readonly payload: JsonContainer;
};

async function hasQueuedStall(
  executor: DatabaseExecutor,
  params: StallAlertParams,
): Promise<boolean> {
  const rows = await executor
    .select({ id: alerts.id })
    .from(alerts)
    .where(
      and(
        eq(alerts.runId, params.runId),
        eq(alerts.candleTime, params.stalledSince),
        eq(alerts.side, ALERT_SIDE.STALL),
        eq(alerts.channel, ALERT_CHANNEL.TELEGRAM),
      ),
    )
    .limit(1);
  return rows.length > 0;
}

// Dono sem Telegram ligado não recebe nada (a faixa do painel basta); o `RESUME` só nasce atrás de um `STALL` do mesmo episódio.
export async function enqueueStallAlert(
  executor: DatabaseExecutor,
  params: StallAlertParams,
): Promise<void> {
  if (!(await isTelegramDeliverable(executor, userIdFromDatabase(params.userId)))) return;
  if (params.side === ALERT_SIDE.RESUME && !(await hasQueuedStall(executor, params))) return;
  await executor
    .insert(alerts)
    .values({
      id: Bun.randomUUIDv7(),
      userId: params.userId,
      runId: params.runId,
      candleTime: params.stalledSince,
      side: params.side,
      channel: ALERT_CHANNEL.TELEGRAM,
      payload: toJsonb(params.payload),
    })
    .onConflictDoNothing({
      target: [alerts.runId, alerts.candleTime, alerts.side, alerts.channel],
    });
}

// O aviso ao painel é só o ponteiro; ele relê a execução para ver `stalledSince`.
export async function notifyStallChange(
  executor: DatabaseExecutor,
  params: { readonly runId: string; readonly stalledSince: number },
): Promise<void> {
  const payload = JSON.stringify({
    runId: params.runId,
    kind: RUN_EVENT_KIND.WARNING,
    eventId: String(params.stalledSince),
  });
  await executor.execute(sql`SELECT pg_notify(${RUN_EVENTS_CHANNEL}, ${payload})`);
}
