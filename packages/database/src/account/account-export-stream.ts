// Copyright (c) 2026 Ada Technology. All rights reserved.
import { and, asc, eq, getTableName, isNull, ne, or, sql, type SQL } from 'drizzle-orm';
import { getTableConfig, type PgColumn, type PgTable } from 'drizzle-orm/pg-core';
import type { BunSQLDatabase } from 'drizzle-orm/bun-sql';

import { ownerCondition, type OwnerScope } from '../ownership/owner-scope.js';
import { OWNED_TABLE_EXPORT_MODE, OWNED_TABLE_EXPORTS } from '../ownership/ownership-registry.js';
import { auditEvents } from '../schema/audit-events.schema.js';
import { EXPORT_PAGE_SIZE, EXPORT_STATEMENT_TIMEOUT_MILLISECONDS } from './account.constant.js';
import {
  EXPORT_AUDIT_AUDIENCE,
  type AccountExportChunk,
  type ExportRow,
  type StreamExportOptions,
} from './account-export.types.js';
import { pickColumns, readUserIdColumn } from './owned-table-columns.js';

type Database = Pick<BunSQLDatabase, 'transaction'>;

const KEY_PREFIX = '__key';

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

// A chave de paginação da tabela: a PK (simples ou composta). Ela entra no SELECT só para o cursor e NUNCA na linha emitida
// (a tabela do código de vínculo, por exemplo, tem como PK uma coluna que a exportação exclui).
function primaryKeyOf(table: PgTable): readonly PgColumn[] {
  const config = getTableConfig(table);
  const single = config.columns.filter((column) => column.primary);
  const composite = config.primaryKeys[0]?.columns ?? [];
  const key = single.length > 0 ? single : composite;
  if (key.length === 0) throw new Error(`Tabela ${getTableName(table)} sem chave primária`);
  return key;
}

function keyAliases(key: readonly PgColumn[]): Record<string, PgColumn> {
  return Object.fromEntries(key.map((column, index) => [`${KEY_PREFIX}${index}`, column]));
}

function afterKey(
  key: readonly PgColumn[],
  values: readonly unknown[] | undefined,
): SQL | undefined {
  if (values === undefined) return undefined;
  const columns = sql.join([...key], sql`, `);
  const parameters = sql.join(
    values.map((value) => sql`${value}`),
    sql`, `,
  );
  return sql`(${columns}) > (${parameters})`;
}

function stripKeys(row: Record<string, unknown>): { row: ExportRow; key: unknown[] } {
  const entries = Object.entries(row);
  const key = entries.filter(([name]) => name.startsWith(KEY_PREFIX)).map(([, value]) => value);
  return { row: Object.fromEntries(entries.filter(([name]) => !name.startsWith(KEY_PREFIX))), key };
}

function withoutKey(row: Record<string, unknown>, name: string): ExportRow {
  return Object.fromEntries(Object.entries(row).filter(([key]) => key !== name));
}

async function withStatementTimeout<TResult>(
  database: Database,
  work: (transaction: Parameters<Parameters<Database['transaction']>[0]>[0]) => Promise<TResult>,
): Promise<TResult> {
  return database.transaction(async (transaction) => {
    await transaction.execute(
      sql`select set_config('statement_timeout', ${String(EXPORT_STATEMENT_TIMEOUT_MILLISECONDS)}, true)`,
    );
    return work(transaction);
  });
}

async function* streamTable(
  database: Database,
  params: {
    readonly scope: OwnerScope;
    readonly table: PgTable;
    readonly columns: readonly string[];
    readonly pageSize: number;
  },
): AsyncGenerator<AccountExportChunk> {
  const { scope, table, pageSize } = params;
  const key = primaryKeyOf(table);
  const selected = { ...pickColumns(table, params.columns), ...keyAliases(key) };
  let after: readonly unknown[] | undefined;
  for (;;) {
    const page = await withStatementTimeout(database, (transaction) =>
      transaction
        .select(selected)
        .from(table)
        .where(and(ownerCondition(scope, readUserIdColumn(table)), afterKey(key, after)))
        .orderBy(...key.map((column) => asc(column)))
        .limit(pageSize),
    );
    if (page.length === 0) return;
    const split = page.map(stripKeys);
    yield { kind: 'rows', table: getTableName(table), rows: split.map((entry) => entry.row) };
    if (page.length < pageSize) return;
    after = split.at(-1)?.key;
  }
}

function auditCondition(scope: OwnerScope, audience: 'asActor' | 'asTarget'): SQL | undefined {
  if (audience === EXPORT_AUDIT_AUDIENCE.ACTOR)
    return eq(auditEvents.actorUserId, scope.ownerUserId);
  return and(
    eq(auditEvents.targetId, scope.ownerUserId),
    or(isNull(auditEvents.actorUserId), ne(auditEvents.actorUserId, scope.ownerUserId)),
  );
}

// O cursor da auditoria é (created_at, id) com o instante em TEXTO: o Date do JS perderia os microssegundos e repetiria linha.
async function* streamAudit(
  database: Database,
  params: {
    readonly scope: OwnerScope;
    readonly audience: 'asActor' | 'asTarget';
    readonly pageSize: number;
  },
): AsyncGenerator<AccountExportChunk> {
  const { scope, audience, pageSize } = params;
  const columns =
    audience === EXPORT_AUDIT_AUDIENCE.ACTOR ? AUDIT_ACTOR_COLUMNS : AUDIT_TARGET_COLUMNS;
  let after: { createdAt: string; id: string } | undefined;
  for (;;) {
    const page = await withStatementTimeout(database, (transaction) =>
      transaction
        .select({ ...columns, createdAtText: sql<string>`${auditEvents.createdAt}::text` })
        .from(auditEvents)
        .where(
          and(
            auditCondition(scope, audience),
            after === undefined
              ? undefined
              : sql`(${auditEvents.createdAt}, ${auditEvents.id}) > (${after.createdAt}::timestamptz, ${after.id}::uuid)`,
          ),
        )
        .orderBy(asc(auditEvents.createdAt), asc(auditEvents.id))
        .limit(pageSize),
    );
    if (page.length === 0) return;
    yield {
      kind: 'audit',
      audience,
      rows: page.map((row) => withoutKey(row, 'createdAtText')),
    };
    const last = page.at(-1);
    if (page.length < pageSize || last === undefined) return;
    after = { createdAt: last.createdAtText, id: last.id };
  }
}

// Tabela por tabela e página por página (cursor pela chave primária): a memória é uma página, nunca a conta inteira.
export async function* streamOwnerRows(
  database: Database,
  scope: OwnerScope,
  options: StreamExportOptions = {},
): AsyncGenerator<AccountExportChunk> {
  const pageSize = options.pageSize ?? EXPORT_PAGE_SIZE;
  for (const step of OWNED_TABLE_EXPORTS) {
    if (step.mode !== OWNED_TABLE_EXPORT_MODE.COLUMNS) continue;
    yield* streamTable(database, { scope, table: step.table, columns: step.columns, pageSize });
  }
  yield* streamAudit(database, { scope, audience: EXPORT_AUDIT_AUDIENCE.ACTOR, pageSize });
  yield* streamAudit(database, { scope, audience: EXPORT_AUDIT_AUDIENCE.TARGET, pageSize });
}
