// Copyright (c) 2026 Ada Technology. All rights reserved.
import { sql } from 'drizzle-orm';
import { check, date, pgTable, smallint, timestamp, varchar } from 'drizzle-orm/pg-core';

export const sentimentDaily = pgTable(
  'sentiment_daily',
  {
    date: date('date', { mode: 'string' }).primaryKey(),
    fearGreed: smallint('fear_greed').notNull(),
    classification: varchar('classification', { length: 32 }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check('sentiment_daily_fear_greed_range_check', sql`${table.fearGreed} between 0 and 100`),
  ],
);
