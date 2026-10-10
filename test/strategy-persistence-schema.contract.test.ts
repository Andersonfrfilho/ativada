// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, test } from 'bun:test';

import {
  getTableConfig,
  PgTable,
  type AnyPgColumn,
} from '../packages/database/node_modules/drizzle-orm/pg-core/index.js';
import { getTableName, is } from '../packages/database/node_modules/drizzle-orm/index.js';
import * as schema from '../packages/database/src/schema/index.js';

const USER_ID_COLUMN = 'user_id';
const RESTRICT = 'restrict';
const PARENT_KEY: readonly string[] = ['id', USER_ID_COLUMN];

type CompositeForeignKey = {
  readonly child: string;
  readonly column: string;
  readonly parent: string;
};

const COMPOSITE_FOREIGN_KEYS: readonly CompositeForeignKey[] = [
  { child: 'strategy_versions', column: 'strategy_id', parent: 'strategies' },
  { child: 'runs', column: 'strategy_version_id', parent: 'strategy_versions' },
  { child: 'runs', column: 'migrated_from_run_id', parent: 'runs' },
  { child: 'signals', column: 'run_id', parent: 'runs' },
  { child: 'orders', column: 'run_id', parent: 'runs' },
  { child: 'fills', column: 'run_id', parent: 'runs' },
  { child: 'positions', column: 'run_id', parent: 'runs' },
  { child: 'equity_points', column: 'run_id', parent: 'runs' },
  { child: 'run_commands', column: 'run_id', parent: 'runs' },
  { child: 'walk_forward_windows', column: 'run_id', parent: 'runs' },
];

const OWNED_TABLE_NAMES: readonly string[] = [
  'strategies',
  'strategy_versions',
  'runs',
  'signals',
  'orders',
  'fills',
  'positions',
  'equity_points',
  'run_commands',
  'walk_forward_windows',
];

const NATURAL_KEYS: Readonly<Record<string, readonly (readonly string[])[]>> = {
  strategy_versions: [
    ['strategy_id', 'version'],
    ['strategy_id', 'config_hash'],
  ],
  signals: [['run_id', 'candle_time']],
  orders: [['run_id', 'engine_key']],
  fills: [['run_id', 'order_key', 'candle_time']],
  positions: [['run_id', 'engine_key']],
  equity_points: [['run_id', 'candle_time']],
  run_commands: [['run_id', 'command_id']],
  walk_forward_windows: [['run_id', 'window_index']],
  sentiment_observations: [['source', 'date', 'observed_at']],
};

const UNIQUE_PARENT_NAMES: readonly string[] = ['strategies', 'strategy_versions', 'runs'];
const NATURAL_KEY_CASES: [string, readonly (readonly string[])[]][] = Object.entries(NATURAL_KEYS);

function isPgTable(value: unknown): value is PgTable {
  return is(value, PgTable);
}

const schemaTables: readonly PgTable[] = Object.values<unknown>(schema).filter(isPgTable);

function findTable(name: string): PgTable {
  const table = schemaTables.find((candidate) => getTableName(candidate) === name);
  if (table === undefined) throw new Error(`tabela ${name} não existe no schema`);
  return table;
}

function columnNames(columns: readonly AnyPgColumn[]): readonly string[] {
  return columns.map((column) => column.name);
}

function indexColumnName(column: unknown): string {
  if (typeof column !== 'object' || column === null || !('name' in column)) return '';
  return typeof column.name === 'string' ? column.name : '';
}

function uniqueColumnSets(table: PgTable): readonly (readonly string[])[] {
  const config = getTableConfig(table);
  return [
    ...config.uniqueConstraints.map((constraint) => columnNames(constraint.columns)),
    ...config.primaryKeys.map((key) => columnNames(key.columns)),
    ...config.indexes
      .filter((index) => index.config.unique)
      .map((index) => index.config.columns.map(indexColumnName)),
  ];
}

describe('persistência de estratégias e execuções — esquema (T3.1)', () => {
  test.each([...OWNED_TABLE_NAMES])(
    '%s exige user_id NOT NULL com FK RESTRICT para users',
    (name) => {
      const config = getTableConfig(findTable(name));
      const userId = config.columns.find((column) => column.name === USER_ID_COLUMN);
      expect({ name, isRequired: userId?.notNull }).toStrictEqual({ name, isRequired: true });
      const toUsers = config.foreignKeys.filter(
        (key) =>
          getTableName(key.reference().foreignTable) === 'users' &&
          columnNames(key.reference().columns).join() === USER_ID_COLUMN,
      );
      expect(toUsers).toHaveLength(1);
      expect(toUsers[0]?.onDelete).toBe(RESTRICT);
    },
  );

  test.each([...UNIQUE_PARENT_NAMES])(
    '%s declara UNIQUE (id, user_id) para a FK composta das filhas',
    (name) => {
      expect(uniqueColumnSets(findTable(name))).toContainEqual(PARENT_KEY);
    },
  );

  test.each([...COMPOSITE_FOREIGN_KEYS])(
    '$child.$column referencia $parent por (id, user_id) com ON DELETE RESTRICT',
    ({ child, column, parent }) => {
      const keys = getTableConfig(findTable(child)).foreignKeys.map((key) => ({
        columns: columnNames(key.reference().columns),
        foreignColumns: columnNames(key.reference().foreignColumns),
        parent: getTableName(key.reference().foreignTable),
        onDelete: key.onDelete,
      }));
      expect(keys).toContainEqual({
        columns: [column, USER_ID_COLUMN],
        foreignColumns: [...PARENT_KEY],
        parent,
        onDelete: RESTRICT,
      });
    },
  );

  test.each(NATURAL_KEY_CASES)('%s tem as chaves naturais únicas', (name, keys) => {
    const found = uniqueColumnSets(findTable(name));
    for (const key of keys) expect(found).toContainEqual([...key]);
  });

  test.each([...OWNED_TABLE_NAMES])('%s tem índice que começa por user_id', (name) => {
    const leadingColumns = getTableConfig(findTable(name)).indexes.map((index) =>
      indexColumnName(index.config.columns[0]),
    );
    expect({ name, hasOwnerIndex: leadingColumns.includes(USER_ID_COLUMN) }).toStrictEqual({
      name,
      hasOwnerIndex: true,
    });
  });

  test('runs tem índice por usuário e data para a listagem do painel', () => {
    const indexes = getTableConfig(findTable('runs')).indexes.map((index) =>
      index.config.columns.map(indexColumnName),
    );
    expect(indexes).toContainEqual([USER_ID_COLUMN, 'created_at', 'id']);
  });

  test('runs guarda o pedido da execução em request jsonb nulo (migration 0010)', () => {
    const request = getTableConfig(findTable('runs')).columns.find(
      (column) => column.name === 'request',
    );
    expect({ type: request?.getSQLType(), notNull: request?.notNull }).toStrictEqual({
      type: 'jsonb',
      notNull: false,
    });
  });

  test('sentiment_observations é dado público: sem user_id, com a chave de append-only', () => {
    const config = getTableConfig(findTable('sentiment_observations'));
    expect(columnNames(config.columns)).not.toContain(USER_ID_COLUMN);
    for (const column of ['date', 'fear_greed', 'observed_at', 'source', 'created_at']) {
      expect(columnNames(config.columns)).toContain(column);
    }
  });

  test('o PK de dono é uuid e equity_points usa a chave natural (run_id, candle_time)', () => {
    for (const name of OWNED_TABLE_NAMES.filter((candidate) => candidate !== 'equity_points')) {
      const id = getTableConfig(findTable(name)).columns.find((column) => column.name === 'id');
      expect({ name, type: id?.getSQLType() }).toStrictEqual({ name, type: 'uuid' });
    }
    const equity = getTableConfig(findTable('equity_points'));
    expect(equity.primaryKeys.map((key) => columnNames(key.columns))).toStrictEqual([
      ['run_id', 'candle_time'],
    ]);
  });
});
