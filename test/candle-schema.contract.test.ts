// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, test } from 'bun:test';

import {
  getTableConfig,
  type AnyPgColumn,
} from '../packages/database/node_modules/drizzle-orm/pg-core/index.js';
import { getTableName } from '../packages/database/node_modules/drizzle-orm/index.js';
import { UNOWNED_PUBLIC_TABLES } from '../packages/database/src/ownership/ownership-registry.js';
import { candles } from '../packages/database/src/schema/candles.schema.js';
import { sentimentDaily } from '../packages/database/src/schema/sentiment-daily.schema.js';

const REPOSITORY_ROOT: string = new URL('../', import.meta.url).pathname;
const MIGRATION_PATH = 'packages/database/drizzle/0005_candles_sentiment_daily.sql';
const ROLLBACK_PATH = 'packages/database/drizzle/0005_candles_sentiment_daily.rollback.sql';
const RANGE_MIGRATION_PATH = 'packages/database/drizzle/0006_candles_open_close_range.sql';
const RANGE_ROLLBACK_PATH = 'packages/database/drizzle/0006_candles_open_close_range.rollback.sql';

async function readRepositoryText(relativePath: string): Promise<string> {
  return Bun.file(`${REPOSITORY_ROOT}${relativePath}`).text();
}

function columnsOf(table: typeof candles | typeof sentimentDaily): Map<string, AnyPgColumn> {
  return new Map(getTableConfig(table).columns.map((column: AnyPgColumn) => [column.name, column]));
}

describe('candles schema (RF01, plan §3)', () => {
  test('the primary key is exchange, symbol, timeframe, open_time in this order', () => {
    const [primaryKey] = getTableConfig(candles).primaryKeys;
    expect(primaryKey?.columns.map((column: AnyPgColumn) => column.name)).toStrictEqual([
      'exchange',
      'symbol',
      'timeframe',
      'open_time',
    ]);
  });

  test('prices are numeric(24, 8), volume is numeric(32, 8) and times are bigint', () => {
    const columns = columnsOf(candles);
    for (const name of ['open', 'high', 'low', 'close']) {
      expect({ name, type: columns.get(name)?.getSQLType() }).toStrictEqual({
        name,
        type: 'numeric(24, 8)',
      });
    }
    expect(columns.get('volume')?.getSQLType()).toBe('numeric(32, 8)');
    expect(columns.get('open_time')?.getSQLType()).toBe('bigint');
    expect(columns.get('close_time')?.getSQLType()).toBe('bigint');
    expect(columns.get('trade_count')?.getSQLType()).toBe('integer');
  });

  test('candles has no user_id: it is public shared data', () => {
    expect([...columnsOf(candles).keys()]).not.toContain('user_id');
  });

  test('declares the four CHECK constraints', () => {
    expect(
      getTableConfig(candles)
        .checks.map((check) => check.name)
        .sort(),
    ).toStrictEqual([
      'candles_close_after_open_check',
      'candles_high_gte_low_check',
      'candles_open_close_within_range_check',
      'candles_timeframe_check',
    ]);
  });

  test('the migration enforces the invariants in SQL, with no native ENUM', async () => {
    const sql = await readRepositoryText(MIGRATION_PATH);
    expect(sql).toMatch(/"close_time"\s*>\s*"[a-z_".]*open_time"/);
    expect(sql).toMatch(/"high"\s*>=\s*"[a-z_".]*low"/);
    expect(sql).toMatch(/in\s*\('15m',\s*'1h',\s*'4h',\s*'1d'\)/i);
    expect(sql).toMatch(/between 0 and 100/i);
    expect(sql).not.toMatch(/AS\s+ENUM/i);
  });

  test('the 0006 migration keeps open and close between low and high, and its rollback drops only that', async () => {
    const sql = await readRepositoryText(RANGE_MIGRATION_PATH);
    expect(sql).toMatch(/ADD CONSTRAINT "candles_open_close_within_range_check"/);
    for (const price of ['open', 'close']) {
      expect(sql).toMatch(new RegExp(`"${price}"\\s*>=\\s*"candles"\\."low"`));
      expect(sql).toMatch(new RegExp(`"${price}"\\s*<=\\s*"candles"\\."high"`));
    }
    const rollback = await readRepositoryText(RANGE_ROLLBACK_PATH);
    expect(rollback).toMatch(/DROP CONSTRAINT "candles_open_close_within_range_check"/);
    expect(rollback).not.toMatch(/DROP TABLE/);
  });

  test('the rollback drops both tables', async () => {
    const sql = await readRepositoryText(ROLLBACK_PATH);
    expect(sql).toMatch(/DROP TABLE "candles"/);
    expect(sql).toMatch(/DROP TABLE "sentiment_daily"/);
  });
});

describe('sentiment_daily schema', () => {
  test('the date column is the primary key and fear_greed is smallint with a 0..100 CHECK', () => {
    const columns = columnsOf(sentimentDaily);
    expect(columns.get('date')?.primary).toBe(true);
    expect(columns.get('date')?.getSQLType()).toBe('date');
    expect(columns.get('fear_greed')?.getSQLType()).toBe('smallint');
    expect(columns.get('classification')?.notNull).toBe(false);
    expect(getTableConfig(sentimentDaily).checks.map((check) => check.name)).toStrictEqual([
      'sentiment_daily_fear_greed_range_check',
    ]);
  });

  test('sentiment_daily has no user_id: it is public shared data', () => {
    expect([...columnsOf(sentimentDaily).keys()]).not.toContain('user_id');
  });
});

describe('public tables without an owner', () => {
  test('are declared in an explicit list, so a future ownerless table cannot slip in', () => {
    expect(UNOWNED_PUBLIC_TABLES.map((table) => getTableName(table)).sort()).toStrictEqual([
      'candles',
      'sentiment_daily',
    ]);
  });
});
