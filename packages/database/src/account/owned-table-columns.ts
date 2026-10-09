// Copyright (c) 2026 Ada Technology. All rights reserved.
import { getTableColumns, getTableName } from 'drizzle-orm';
import type { PgColumn, PgTable } from 'drizzle-orm/pg-core';

const USER_ID_PROPERTY = 'userId';

export function readUserIdColumn(table: PgTable): PgColumn {
  const column = getTableColumns(table)[USER_ID_PROPERTY];
  if (column === undefined) {
    throw new Error(`Tabela de dono ${getTableName(table)} sem a propriedade ${USER_ID_PROPERTY}`);
  }
  return column;
}

export function pickColumns(
  table: PgTable,
  propertyNames: readonly string[],
): Readonly<Record<string, PgColumn>> {
  const tableColumns = getTableColumns(table);
  const picked: Record<string, PgColumn> = {};
  for (const propertyName of propertyNames) {
    const column = tableColumns[propertyName];
    if (column === undefined) {
      throw new Error(`Coluna ${propertyName} não existe em ${getTableName(table)}`);
    }
    picked[propertyName] = column;
  }
  return picked;
}
