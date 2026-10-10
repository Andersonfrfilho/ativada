// Copyright (c) 2026 Ada Technology. All rights reserved.
import { sql } from 'drizzle-orm';
import {
  bigint,
  check,
  integer,
  numeric,
  pgTable,
  primaryKey,
  timestamp,
  varchar,
} from 'drizzle-orm/pg-core';

import { CANDLE_TIMEFRAMES } from '../candles/candle.constant.js';

// Lista fixa de constantes do código, nunca entrada do usuário: por isso `sql.raw` é seguro aqui.
const TIMEFRAME_LITERALS = sql.raw(
  CANDLE_TIMEFRAMES.map((timeframe) => `'${timeframe}'`).join(', '),
);

// A PK (exchange, symbol, timeframe, open_time) já serve a leitura do mais recente (varredura inversa).
export const candles = pgTable(
  'candles',
  {
    exchange: varchar('exchange', { length: 32 }).notNull(),
    symbol: varchar('symbol', { length: 32 }).notNull(),
    timeframe: varchar('timeframe', { length: 8 }).notNull(),
    openTime: bigint('open_time', { mode: 'number' }).notNull(),
    closeTime: bigint('close_time', { mode: 'number' }).notNull(),
    open: numeric('open', { precision: 24, scale: 8 }).notNull(),
    high: numeric('high', { precision: 24, scale: 8 }).notNull(),
    low: numeric('low', { precision: 24, scale: 8 }).notNull(),
    close: numeric('close', { precision: 24, scale: 8 }).notNull(),
    volume: numeric('volume', { precision: 32, scale: 8 }).notNull(),
    tradeCount: integer('trade_count').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.exchange, table.symbol, table.timeframe, table.openTime] }),
    check('candles_close_after_open_check', sql`${table.closeTime} > ${table.openTime}`),
    check('candles_high_gte_low_check', sql`${table.high} >= ${table.low}`),
    check(
      'candles_open_close_within_range_check',
      sql`${table.open} >= ${table.low} AND ${table.open} <= ${table.high} AND ${table.close} >= ${table.low} AND ${table.close} <= ${table.high}`,
    ),
    check('candles_timeframe_check', sql`${table.timeframe} in (${TIMEFRAME_LITERALS})`),
  ],
);
