// Copyright (c) 2026 Ada Technology. All rights reserved.
import { getTableName } from 'drizzle-orm';
import type { BunSQLDatabase } from 'drizzle-orm/bun-sql';

import { readOpenDatabase, type DatabaseHandle } from '../database-handle.js';
import { ownerCondition, type OwnerScope } from '../ownership/owner-scope.js';
import { OWNED_TABLE_EXPORT_MODE, OWNED_TABLE_EXPORTS } from '../ownership/ownership-registry.js';
import { users } from '../schema/users.schema.js';
import { streamOwnerRows } from './account-export-stream.js';
import {
  EXPORT_AUDIT_AUDIENCE,
  type AccountExport,
  type AccountExportChunk,
  type ExportRow,
  type StreamExportOptions,
} from './account-export.types.js';

export type AccountExportRepository = {
  // O perfil do dono (`undefined` se a conta não existe): é a primeira linha da exportação.
  readonly readAccount: (scope: OwnerScope) => Promise<ExportRow | undefined>;
  // As tabelas do dono e a auditoria, em PÁGINAS por cursor: quem consome puxa uma página por vez.
  readonly streamOwnerRows: (
    scope: OwnerScope,
    options?: StreamExportOptions,
  ) => AsyncIterable<AccountExportChunk>;
  // O conjunto inteiro de uma vez (junta as páginas): para verificação em teste; a rota de exportação NUNCA o usa.
  readonly exportOwnerData: (scope: OwnerScope) => Promise<AccountExport | undefined>;
};

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

async function readAccount(
  database: BunSQLDatabase,
  scope: OwnerScope,
): Promise<ExportRow | undefined> {
  const rows = await database
    .select(ACCOUNT_COLUMNS)
    .from(users)
    .where(ownerCondition(scope, users.id))
    .limit(1);
  return rows[0];
}

async function collect(
  database: BunSQLDatabase,
  scope: OwnerScope,
): Promise<AccountExport | undefined> {
  const account = await readAccount(database, scope);
  if (account === undefined) return undefined;
  const tables: Record<string, ExportRow[]> = {};
  for (const step of OWNED_TABLE_EXPORTS) {
    if (step.mode === OWNED_TABLE_EXPORT_MODE.COLUMNS) tables[getTableName(step.table)] = [];
  }
  const audit = { asActor: [] as ExportRow[], asTarget: [] as ExportRow[] };
  for await (const chunk of streamOwnerRows(database, scope)) {
    if (chunk.kind === 'rows') tables[chunk.table]?.push(...chunk.rows);
    else
      audit[chunk.audience === EXPORT_AUDIT_AUDIENCE.ACTOR ? 'asActor' : 'asTarget'].push(
        ...chunk.rows,
      );
  }
  return { account, tables, auditEvents: audit };
}

export function createAccountExportRepository(handle: DatabaseHandle): AccountExportRepository {
  const { database } = readOpenDatabase(handle);
  return {
    readAccount: (scope) => readAccount(database, scope),
    streamOwnerRows: (scope, options) => streamOwnerRows(database, scope, options),
    exportOwnerData: (scope) => collect(database, scope),
  };
}
