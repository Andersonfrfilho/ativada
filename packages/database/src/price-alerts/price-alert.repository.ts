// Copyright (c) 2026 Ada Technology. All rights reserved.
import { and, count, desc, eq, isNotNull, isNull, ne, sql, type SQL } from 'drizzle-orm';

import type { DatabaseExecutor } from '../database-executor.js';
import { readOpenDatabase, type DatabaseHandle } from '../database-handle.js';
import { ownerCondition, type OwnerScope } from '../ownership/owner-scope.js';
import { priceAlerts } from '../schema/price-alerts.schema.js';
import { users } from '../schema/users.schema.js';
import {
  PRICE_ALERT_CREATE_OUTCOME,
  PRICE_ALERT_PAGE_MAXIMUM_SIZE,
  PRICE_ALERT_UPDATE_OUTCOME,
} from './price-alert.constant.js';
import { PRICE_ALERT_COLUMNS, toPriceAlertRecord } from './price-alert-record.mapper.js';
import type {
  CreatePriceAlertParams,
  CreatePriceAlertResult,
  ListPriceAlertsParams,
  PriceAlertCursor,
  PriceAlertRecord,
  PriceAlertRepository,
  PriceAlertsPage,
  UpdatePriceAlertParams,
  UpdatePriceAlertResult,
} from './price-alert.types.js';

type Database = ReturnType<typeof readOpenDatabase>['database'];

function ownedAlert(scope: OwnerScope, alertId: string): SQL | undefined {
  return and(ownerCondition(scope, priceAlerts.userId), eq(priceAlerts.id, alertId));
}

// A linha do dono TRAVADA serializa criações e religamentos: dois pedidos simultâneos não passam juntos do teto.
async function lockOwner(executor: DatabaseExecutor, scope: OwnerScope): Promise<void> {
  await executor
    .select({ id: users.id })
    .from(users)
    .where(eq(users.id, scope.ownerUserId))
    .for('no key update');
}

async function countEnabled(executor: DatabaseExecutor, scope: OwnerScope): Promise<number> {
  const rows = await executor
    .select({ total: count() })
    .from(priceAlerts)
    .where(and(ownerCondition(scope, priceAlerts.userId), eq(priceAlerts.isEnabled, true)));
  return rows[0]?.total ?? 0;
}

async function createPriceAlert(
  database: Database,
  scope: OwnerScope,
  params: CreatePriceAlertParams,
): Promise<CreatePriceAlertResult> {
  return database.transaction(async (transaction): Promise<CreatePriceAlertResult> => {
    await lockOwner(transaction, scope);
    if ((await countEnabled(transaction, scope)) >= params.maxEnabled) {
      return { outcome: PRICE_ALERT_CREATE_OUTCOME.LIMIT_REACHED };
    }
    const rows = await transaction
      .insert(priceAlerts)
      .values({
        id: Bun.randomUUIDv7(),
        userId: scope.ownerUserId,
        symbol: params.symbol,
        direction: params.direction,
        value: params.value,
        origin: params.origin,
      })
      .returning(PRICE_ALERT_COLUMNS);
    const row = rows[0];
    if (row === undefined) throw new Error('INSERT de price_alerts não devolveu a linha');
    return { outcome: PRICE_ALERT_CREATE_OUTCOME.CREATED, alert: toPriceAlertRecord(row) };
  });
}

async function findPriceAlert(
  executor: DatabaseExecutor,
  scope: OwnerScope,
  alertId: string,
): Promise<PriceAlertRecord | undefined> {
  const rows = await executor
    .select(PRICE_ALERT_COLUMNS)
    .from(priceAlerts)
    .where(ownedAlert(scope, alertId))
    .limit(1);
  const row = rows[0];
  return row === undefined ? undefined : toPriceAlertRecord(row);
}

function isBeforeCursor(after: PriceAlertCursor | undefined): SQL | undefined {
  if (after === undefined) return undefined;
  return sql`(${priceAlerts.createdAt}, ${priceAlerts.id}) < (${after.createdAt}::timestamptz, ${after.id}::uuid)`;
}

// Mais recentes primeiro. O cursor leva `created_at::text` (microssegundos): o Date do JS repetiria linhas.
async function listPriceAlertsPage(
  executor: DatabaseExecutor,
  scope: OwnerScope,
  params: ListPriceAlertsParams,
): Promise<PriceAlertsPage> {
  const limit = Math.min(Math.max(Math.trunc(params.limit), 1), PRICE_ALERT_PAGE_MAXIMUM_SIZE);
  const rows = await executor
    .select({
      ...PRICE_ALERT_COLUMNS,
      createdAtText: sql<string>`${priceAlerts.createdAt}::text`,
    })
    .from(priceAlerts)
    .where(and(ownerCondition(scope, priceAlerts.userId), isBeforeCursor(params.after)))
    .orderBy(desc(priceAlerts.createdAt), desc(priceAlerts.id))
    .limit(limit + 1);
  const page = rows.slice(0, limit);
  const last = page.at(-1);
  return {
    alerts: page.map(toPriceAlertRecord),
    nextCursor:
      rows.length > limit && last !== undefined
        ? { createdAt: last.createdAtText, id: last.id }
        : undefined,
  };
}

// Os desligados à mão: sem disparo (o disparado tem a limpeza própria) e sem contar o que está sendo alterado.
async function countDisabledByHand(
  executor: DatabaseExecutor,
  params: { readonly scope: OwnerScope; readonly exceptAlertId: string },
): Promise<number> {
  const rows = await executor
    .select({ total: count() })
    .from(priceAlerts)
    .where(
      and(
        ownerCondition(params.scope, priceAlerts.userId),
        eq(priceAlerts.isEnabled, false),
        isNull(priceAlerts.triggeredAt),
        ne(priceAlerts.id, params.exceptAlertId),
      ),
    );
  return rows[0]?.total ?? 0;
}

// Religar rearma (limpa o disparo) e conta no teto; desligar guarda o instante do disparo, se houve.
async function updatePriceAlert(
  database: Database,
  scope: OwnerScope,
  params: UpdatePriceAlertParams,
): Promise<UpdatePriceAlertResult> {
  const { alertId, patch } = params;
  return database.transaction(async (transaction): Promise<UpdatePriceAlertResult> => {
    await lockOwner(transaction, scope);
    const current = await findPriceAlert(transaction, scope, alertId);
    if (current === undefined) return { outcome: PRICE_ALERT_UPDATE_OUTCOME.NOT_FOUND };
    const isRearming = patch.isEnabled === true && !current.isEnabled;
    if (isRearming && (await countEnabled(transaction, scope)) >= params.maxEnabled) {
      return { outcome: PRICE_ALERT_UPDATE_OUTCOME.LIMIT_REACHED };
    }
    if (patch.isEnabled === false && params.maxDisabled !== undefined) {
      const disabled = await countDisabledByHand(transaction, { scope, exceptAlertId: alertId });
      if (disabled >= params.maxDisabled) {
        return { outcome: PRICE_ALERT_UPDATE_OUTCOME.DISABLED_LIMIT_REACHED };
      }
    }
    const rows = await transaction
      .update(priceAlerts)
      .set({ ...patch, ...(patch.isEnabled === true ? { triggeredAt: null } : {}) })
      .where(ownedAlert(scope, alertId))
      .returning(PRICE_ALERT_COLUMNS);
    const row = rows[0];
    if (row === undefined) return { outcome: PRICE_ALERT_UPDATE_OUTCOME.NOT_FOUND };
    return { outcome: PRICE_ALERT_UPDATE_OUTCOME.UPDATED, alert: toPriceAlertRecord(row) };
  });
}

async function deletePriceAlert(
  executor: DatabaseExecutor,
  scope: OwnerScope,
  alertId: string,
): Promise<boolean> {
  const rows = await executor
    .delete(priceAlerts)
    .where(ownedAlert(scope, alertId))
    .returning({ id: priceAlerts.id });
  return rows.length > 0;
}

async function deleteFiredPriceAlerts(
  executor: DatabaseExecutor,
  scope: OwnerScope,
): Promise<number> {
  const rows = await executor
    .delete(priceAlerts)
    .where(and(ownerCondition(scope, priceAlerts.userId), isNotNull(priceAlerts.triggeredAt)))
    .returning({ id: priceAlerts.id });
  return rows.length;
}

export function createPriceAlertRepository(handle: DatabaseHandle): PriceAlertRepository {
  const { database } = readOpenDatabase(handle);
  return {
    createPriceAlert: (scope, params) => createPriceAlert(database, scope, params),
    findPriceAlert: (scope, alertId) => findPriceAlert(database, scope, alertId),
    listPriceAlertsPage: (scope, params) => listPriceAlertsPage(database, scope, params),
    updatePriceAlert: (scope, params) => updatePriceAlert(database, scope, params),
    deletePriceAlert: (scope, alertId) => deletePriceAlert(database, scope, alertId),
    deleteFiredPriceAlerts: (scope) => deleteFiredPriceAlerts(database, scope),
  };
}
