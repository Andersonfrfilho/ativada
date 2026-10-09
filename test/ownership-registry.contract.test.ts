// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, test } from 'bun:test';

import {
  getTableConfig,
  PgTable,
  type AnyPgColumn,
} from '../packages/database/node_modules/drizzle-orm/pg-core/index.js';
import { getTableName, is } from '../packages/database/node_modules/drizzle-orm/index.js';
import {
  OWNED_TABLES,
  PSEUDONYMIZED_TABLES,
  SHARED_TABLES,
} from '../packages/database/src/ownership/ownership-registry.js';
import * as schema from '../packages/database/src/schema/index.js';

const USER_ID_COLUMN = 'user_id';
const USERS_TABLE = 'users';

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

  test('telegram_link_codes is owned and is never exported (secret transient)', () => {
    expect(ownedNames).toContain('telegram_link_codes');
  });
});
