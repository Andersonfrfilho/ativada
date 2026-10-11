// Copyright (c) 2026 Ada Technology. All rights reserved.
import { and, eq, isNull, or, sql } from 'drizzle-orm';

import { isTelegramDeliverable } from '../alerts/alert-write.js';
import { ALERT_CHANNEL, ALERT_SIDE } from '../alerts/alert.constant.js';
import { readOpenDatabase, type DatabaseHandle } from '../database-handle.js';
import { toJsonb } from '../jsonb.js';
import { userIdFromDatabase } from '../ownership/user-id.js';
import { RUN_EVENTS_CHANNEL, PRICE_ALERT_EVENT_KIND } from '../run-events/run-event.constant.js';
import { alerts } from '../schema/alerts.schema.js';
import { priceAlerts } from '../schema/price-alerts.schema.js';
import { users } from '../schema/users.schema.js';
import { PRICE_ALERT_DIRECTION } from './price-alert.constant.js';

export type FireDueAlertsParams = {
  readonly symbol: string;
  // Preço do tick agregado, em texto decimal exato, e o instante dele (ms): a chave de unicidade do aviso.
  readonly price: string;
  readonly eventTime: number;
};

export type FireDueAlertsResult = { readonly firedAlertIds: readonly string[] };

// Sem `OwnerScope`: quem avalia é a API, que cruza o preço PÚBLICO com os alertas de todos; o aviso sempre vai ao dono da linha.
export type PriceAlertEvaluationRepository = {
  // Dispara UMA vez os alertas ligados e ainda armados do par que o preço cruzou: `UPDATE ... WHERE ligado AND disparado_em
  // IS NULL` desliga e carimba o alerta (dois processos nunca disparam o mesmo), e na MESMA transação enfileira o aviso do
  // Telegram (se o dono o tem) e emite o NOTIFY para o painel.
  readonly fireDueAlerts: (params: FireDueAlertsParams) => Promise<FireDueAlertsResult>;
  // O dono ativo do alerta, para a API entregar o aviso só a ele; `undefined` se sumiu ou a conta não está ativa.
  readonly findActiveOwnerId: (alertId: string) => Promise<string | undefined>;
};

type Database = ReturnType<typeof readOpenDatabase>['database'];

type FiredRow = {
  readonly id: string;
  readonly userId: string;
  readonly direction: string;
  readonly value: string;
};

function isCrossedBy(price: string): ReturnType<typeof or> {
  const observed = sql`${price}::numeric`;
  return or(
    and(
      eq(priceAlerts.direction, PRICE_ALERT_DIRECTION.ABOVE),
      sql`${priceAlerts.value} <= ${observed}`,
    ),
    and(
      eq(priceAlerts.direction, PRICE_ALERT_DIRECTION.BELOW),
      sql`${priceAlerts.value} >= ${observed}`,
    ),
  );
}

async function enqueueTelegram(
  transaction: Parameters<Parameters<Database['transaction']>[0]>[0],
  params: FireDueAlertsParams & { readonly fired: readonly FiredRow[] },
): Promise<void> {
  const rows = [];
  for (const row of params.fired) {
    if (!(await isTelegramDeliverable(transaction, userIdFromDatabase(row.userId)))) continue;
    rows.push({
      id: Bun.randomUUIDv7(),
      userId: row.userId,
      priceAlertId: row.id,
      candleTime: params.eventTime,
      side: ALERT_SIDE.PRICE,
      channel: ALERT_CHANNEL.TELEGRAM,
      payload: toJsonb({
        symbol: params.symbol,
        direction: row.direction,
        threshold: row.value,
        price: params.price,
      }),
    });
  }
  if (rows.length === 0) return;
  await transaction
    .insert(alerts)
    .values(rows)
    .onConflictDoNothing({
      target: [alerts.priceAlertId, alerts.candleTime],
      where: sql`${alerts.priceAlertId} is not null`,
    });
}

async function fireDueAlerts(
  database: Database,
  params: FireDueAlertsParams,
): Promise<FireDueAlertsResult> {
  return database.transaction(async (transaction): Promise<FireDueAlertsResult> => {
    const fired = await transaction
      .update(priceAlerts)
      .set({ isEnabled: false, triggeredAt: sql`now()` })
      .where(
        and(
          eq(priceAlerts.symbol, params.symbol),
          eq(priceAlerts.isEnabled, true),
          isNull(priceAlerts.triggeredAt),
          isCrossedBy(params.price),
        ),
      )
      .returning({
        id: priceAlerts.id,
        userId: priceAlerts.userId,
        direction: priceAlerts.direction,
        value: priceAlerts.value,
      });
    await enqueueTelegram(transaction, { ...params, fired });
    for (const row of fired) {
      await transaction.execute(
        sql`SELECT pg_notify(${RUN_EVENTS_CHANNEL}, ${JSON.stringify({ kind: PRICE_ALERT_EVENT_KIND, alertId: row.id })})`,
      );
    }
    return { firedAlertIds: fired.map((row) => row.id) };
  });
}

async function findActiveOwnerId(database: Database, alertId: string): Promise<string | undefined> {
  const rows = await database
    .select({ ownerId: priceAlerts.userId })
    .from(priceAlerts)
    .innerJoin(users, eq(users.id, priceAlerts.userId))
    .where(and(eq(priceAlerts.id, alertId), isNull(users.deletedAt), isNull(users.blockedAt)))
    .limit(1);
  return rows[0]?.ownerId;
}

export function createPriceAlertEvaluationRepository(
  handle: DatabaseHandle,
): PriceAlertEvaluationRepository {
  const { database } = readOpenDatabase(handle);
  return {
    fireDueAlerts: (params) => fireDueAlerts(database, params),
    findActiveOwnerId: (alertId) => findActiveOwnerId(database, alertId),
  };
}
