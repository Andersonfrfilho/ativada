// Copyright (c) 2026 Ada Technology. All rights reserved.
import { getTableName } from 'drizzle-orm';
import type { PgTable } from 'drizzle-orm/pg-core';

import { auditEvents } from '../schema/audit-events.schema.js';
import { telegramLinkCodes } from '../schema/telegram-link-codes.schema.js';
import { users } from '../schema/users.schema.js';

export type PseudonymizedTable = {
  readonly table: PgTable;
  readonly nullifiedColumns: readonly string[];
};

export const OWNED_TABLE_EXPORT_MODE = {
  COLUMNS: 'columns',
  EXCLUDED: 'excluded',
} as const;

export type OwnedTableExportStep = {
  readonly table: PgTable;
} & (
  | {
      readonly mode: typeof OWNED_TABLE_EXPORT_MODE.COLUMNS;
      readonly columns: readonly string[];
    }
  | {
      readonly mode: typeof OWNED_TABLE_EXPORT_MODE.EXCLUDED;
      readonly reason: string;
    }
);

export const OWNED_TABLES: readonly PgTable[] = [telegramLinkCodes];

// Cada tabela de dono declara aqui o que a exportação leva (lista de propriedades do schema Drizzle);
// o hash do código de vínculo é segredo transitório e fica de fora.
export const OWNED_TABLE_EXPORTS: readonly OwnedTableExportStep[] = [
  {
    table: telegramLinkCodes,
    mode: OWNED_TABLE_EXPORT_MODE.COLUMNS,
    columns: ['expiresAt', 'attempts', 'createdAt'],
  },
];

// Ordem da exclusão (ADR 0001 §h passo 3): filhas antes dos pais, porque a FK é ON DELETE RESTRICT.
export const OWNED_TABLE_DELETION_ORDER: readonly PgTable[] = [telegramLinkCodes];

export const PSEUDONYMIZED_TABLES: readonly PseudonymizedTable[] = [
  { table: auditEvents, nullifiedColumns: ['actor_user_id', 'target_id', 'ip'] },
];

export const SHARED_TABLES: readonly PgTable[] = [users];

export function tableNameOf(table: PgTable): string {
  return getTableName(table);
}
