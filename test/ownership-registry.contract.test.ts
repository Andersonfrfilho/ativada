// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, test } from 'bun:test';

import {
  getTableConfig,
  PgTable,
  type AnyPgColumn,
} from '../packages/database/node_modules/drizzle-orm/pg-core/index.js';
import {
  getTableColumns,
  getTableName,
  is,
} from '../packages/database/node_modules/drizzle-orm/index.js';
import { PSEUDONYMIZATION_STEPS } from '../packages/database/src/account/pseudonymization-steps.js';
import {
  OWNED_TABLE_DELETION_ORDER,
  OWNED_TABLE_EXPORT_MODE,
  OWNED_TABLE_EXPORTS,
  OWNED_TABLES,
  PSEUDONYMIZED_TABLES,
  SHARED_TABLES,
} from '../packages/database/src/ownership/ownership-registry.js';
import * as schema from '../packages/database/src/schema/index.js';

const USER_ID_COLUMN = 'user_id';
const USERS_TABLE = 'users';
const USER_ID_PROPERTY = 'userId';
const SECRET_COLUMN_PATTERN = /hash|secret|token|ciphertext|password|^iv$/i;

function isPgTable(value: unknown): value is PgTable {
  return is(value, PgTable);
}

const schemaTables: readonly PgTable[] = Object.values<unknown>(schema).filter(isPgTable);

function nameOf(table: PgTable): string {
  return getTableName(table);
}

function columnNames(table: PgTable): readonly string[] {
  return getTableConfig(table).columns.map((column: AnyPgColumn) => column.name);
}

const ownedNames = OWNED_TABLES.map(nameOf);
const pseudonymizedNames = PSEUDONYMIZED_TABLES.map((entry) => nameOf(entry.table));
const sharedNames = SHARED_TABLES.map(nameOf);

describe('ownership registry (ADR 0001 §h)', () => {
  test('every table with a user_id column is registered as owned', () => {
    const withUserId = schemaTables
      .filter((table) => columnNames(table).includes(USER_ID_COLUMN))
      .map(nameOf);
    for (const name of withUserId) expect(ownedNames).toContain(name);
  });

  test('every schema table is in exactly one category', () => {
    for (const table of schemaTables) {
      const name = nameOf(table);
      const categories = [ownedNames, pseudonymizedNames, sharedNames].filter((names) =>
        names.includes(name),
      );
      expect({ name, categories: categories.length }).toStrictEqual({ name, categories: 1 });
    }
  });

  test('every registered table exists in the schema', () => {
    const known = schemaTables.map(nameOf);
    for (const name of [...ownedNames, ...pseudonymizedNames, ...sharedNames]) {
      expect(known).toContain(name);
    }
  });

  test('owned tables have user_id NOT NULL referencing users', () => {
    expect(ownedNames.length).toBeGreaterThan(0);
    for (const table of OWNED_TABLES) {
      const config = getTableConfig(table);
      const userId = config.columns.find((column: AnyPgColumn) => column.name === USER_ID_COLUMN);
      const references = config.foreignKeys.map((key) => ({
        column: key.reference().columns[0]?.name,
        target: getTableName(key.reference().foreignTable),
      }));
      expect({ table: nameOf(table), isRequired: userId?.notNull }).toStrictEqual({
        table: nameOf(table),
        isRequired: true,
      });
      expect(references).toContainEqual({ column: USER_ID_COLUMN, target: USERS_TABLE });
    }
  });

  test('pseudonymized tables declare columns that exist and are nullable', () => {
    for (const entry of PSEUDONYMIZED_TABLES) {
      const columns = getTableConfig(entry.table).columns;
      expect(entry.nullifiedColumns.length).toBeGreaterThan(0);
      for (const name of entry.nullifiedColumns) {
        const column = columns.find((candidate: AnyPgColumn) => candidate.name === name);
        expect({ name, isNullable: column?.notNull === false }).toStrictEqual({
          name,
          isNullable: true,
        });
      }
    }
  });

  test('telegram_link_codes is owned and its export never carries the code hash', () => {
    expect(ownedNames).toContain('telegram_link_codes');
    const step = OWNED_TABLE_EXPORTS.find((entry) => nameOf(entry.table) === 'telegram_link_codes');
    expect(step?.mode).toBe(OWNED_TABLE_EXPORT_MODE.COLUMNS);
    if (step?.mode === OWNED_TABLE_EXPORT_MODE.COLUMNS)
      expect(step.columns).not.toContain('codeHash');
  });

  test('every owned table exposes the userId property the generic export and purge steps rely on', () => {
    for (const table of OWNED_TABLES) {
      const column = getTableColumns(table)[USER_ID_PROPERTY];
      expect({ table: nameOf(table), column: column?.name }).toStrictEqual({
        table: nameOf(table),
        column: USER_ID_COLUMN,
      });
    }
  });
});

describe('ownership registry — export and deletion steps (ADR 0001 §h)', () => {
  const exportedNames = OWNED_TABLE_EXPORTS.map((step) => nameOf(step.table));
  const deletionOrder = OWNED_TABLE_DELETION_ORDER.map(nameOf);

  test('every owned table declares exactly one export step, and no other table does', () => {
    expect([...exportedNames].sort()).toStrictEqual([...ownedNames].sort());
  });

  test('every owned table declares exactly one deletion step, and no other table does', () => {
    expect([...deletionOrder].sort()).toStrictEqual([...ownedNames].sort());
  });

  test('an export step either lists existing columns or explains why the table is left out', () => {
    for (const step of OWNED_TABLE_EXPORTS) {
      if (step.mode === OWNED_TABLE_EXPORT_MODE.EXCLUDED) {
        expect(step.reason.length).toBeGreaterThan(0);
        continue;
      }
      const properties = Object.keys(getTableColumns(step.table));
      expect(step.columns.length).toBeGreaterThan(0);
      for (const column of step.columns) expect(properties).toContain(column);
    }
  });

  test('the export never lists a secret column (hash, token, ciphertext, password)', () => {
    for (const step of OWNED_TABLE_EXPORTS) {
      if (step.mode !== OWNED_TABLE_EXPORT_MODE.COLUMNS) continue;
      for (const column of step.columns) {
        expect({
          table: nameOf(step.table),
          column,
          isSecret: SECRET_COLUMN_PATTERN.test(column),
        }).toStrictEqual({ table: nameOf(step.table), column, isSecret: false });
      }
    }
  });

  test('the deletion order puts every child before the owned table it references', () => {
    for (const table of OWNED_TABLE_DELETION_ORDER) {
      for (const key of getTableConfig(table).foreignKeys) {
        const parent = getTableName(key.reference().foreignTable);
        if (!ownedNames.includes(parent) || parent === nameOf(table)) continue;
        expect(deletionOrder.indexOf(nameOf(table))).toBeLessThan(deletionOrder.indexOf(parent));
      }
    }
  });

  test('every pseudonymized table has exactly one pseudonymization step, and no other table does', () => {
    expect(Object.keys(PSEUDONYMIZATION_STEPS).sort()).toStrictEqual(
      [...pseudonymizedNames].sort(),
    );
  });
});
