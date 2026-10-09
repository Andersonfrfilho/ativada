// Copyright (c) 2026 Ada Technology. All rights reserved.
import { and, asc, eq, getTableName, isNull, ne, or, sql } from 'drizzle-orm';
import type { BunSQLDatabase } from 'drizzle-orm/bun-sql';

import { readOpenDatabase, type DatabaseHandle } from '../database-handle.js';
import { ownerCondition, type OwnerScope } from '../ownership/owner-scope.js';
import { OWNED_TABLE_EXPORT_MODE, OWNED_TABLE_EXPORTS } from '../ownership/ownership-registry.js';
import { auditEvents } from '../schema/audit-events.schema.js';
import { users } from '../schema/users.schema.js';
import { EXPORT_STATEMENT_TIMEOUT_MILLISECONDS } from './account.constant.js';
import type { AccountExport, AccountExportAuditEvents, ExportRow } from './account-export.types.js';
import { pickColumns, readUserIdColumn } from './owned-table-columns.js';

export type AccountExportRepository = {
  readonly exportOwnerData: (scope: OwnerScope) => Promise<AccountExport | undefined>;
};

type ExportExecutor = Pick<BunSQLDatabase, 'select' | 'execute'>;

const ACCOUNT_COLUMNS = {
  displayName: users.displayName,
  displayCurrency: users.displayCurrency,
  timezone: users.timezone,
  telegramChatId: users.telegramChatId,
  alertTelegramEnabled: users.alertTelegramEnabled,
  limits: users.limits,
  createdAt: users.createdAt,
  updatedAt: users.updatedAt,
} as const;

const AUDIT_ACTOR_COLUMNS = {
  id: auditEvents.id,
  actorKind: auditEvents.actorKind,
  targetKind: auditEvents.targetKind,
  action: auditEvents.action,
  ip: auditEvents.ip,
  createdAt: auditEvents.createdAt,
  payload: auditEvents.payload,
} as const;

// Quando o dono é só o alvo, o ator e o IP são de outra pessoa e ficam fora.
const AUDIT_TARGET_COLUMNS = {
  id: auditEvents.id,
  actorKind: auditEvents.actorKind,
  targetKind: auditEvents.targetKind,
  action: auditEvents.action,
  createdAt: auditEvents.createdAt,
  payload: auditEvents.payload,
} as const;

async function selectAccount(
  executor: ExportExecutor,
  scope: OwnerScope,
): Promise<ExportRow | undefined> {
  const rows = await executor
    .select(ACCOUNT_COLUMNS)
    .from(users)
    .where(ownerCondition(scope, users.id))
    .limit(1);
  return rows[0];
}

async function selectOwnedTables(
  executor: ExportExecutor,
  scope: OwnerScope,
): Promise<Readonly<Record<string, readonly ExportRow[]>>> {
  const tables: Record<string, readonly ExportRow[]> = {};
  for (const step of OWNED_TABLE_EXPORTS) {
    if (step.mode !== OWNED_TABLE_EXPORT_MODE.COLUMNS) continue;
    tables[getTableName(step.table)] = await executor
      .select(pickColumns(step.table, step.columns))
      .from(step.table)
      .where(ownerCondition(scope, readUserIdColumn(step.table)));
  }
  return tables;
}

async function selectAuditEvents(
  executor: ExportExecutor,
  scope: OwnerScope,
): Promise<AccountExportAuditEvents> {
  const asActor = await executor
    .select(AUDIT_ACTOR_COLUMNS)
    .from(auditEvents)
    .where(eq(auditEvents.actorUserId, scope.ownerUserId))
    .orderBy(asc(auditEvents.createdAt), asc(auditEvents.id));
  const asTarget = await executor
    .select(AUDIT_TARGET_COLUMNS)
    .from(auditEvents)
    .where(
      and(
        eq(auditEvents.targetId, scope.ownerUserId),
        or(isNull(auditEvents.actorUserId), ne(auditEvents.actorUserId, scope.ownerUserId)),
      ),
    )
    .orderBy(asc(auditEvents.createdAt), asc(auditEvents.id));
  return { asActor, asTarget };
}

async function readExport(
  database: BunSQLDatabase,
  scope: OwnerScope,
): Promise<AccountExport | undefined> {
  return database.transaction(async (transaction) => {
    await transaction.execute(
      sql`select set_config('statement_timeout', ${String(EXPORT_STATEMENT_TIMEOUT_MILLISECONDS)}, true)`,
    );
    const account = await selectAccount(transaction, scope);
    if (account === undefined) return undefined;
    return {
      account,
      tables: await selectOwnedTables(transaction, scope),
      auditEvents: await selectAuditEvents(transaction, scope),
    };
  });
}

export function createAccountExportRepository(handle: DatabaseHandle): AccountExportRepository {
  const { database } = readOpenDatabase(handle);
  return { exportOwnerData: (scope) => readExport(database, scope) };
}
