// Copyright (c) 2026 Ada Technology. All rights reserved.
import { sql } from 'drizzle-orm';
import {
  bigint,
  check,
  date,
  index,
  pgTable,
  smallint,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

export const SENTIMENT_SOURCE_MAX_LENGTH = 64;

// Dado público, append-only (gatilho na migration): a fonte do motor, ao contrário de `sentiment_daily`.
export const sentimentObservations = pgTable(
  'sentiment_observations',
  {
    id: uuid('id').primaryKey(),
    date: date('date', { mode: 'string' }).notNull(),
    fearGreed: smallint('fear_greed').notNull(),
    observedAt: bigint('observed_at', { mode: 'number' }).notNull(),
    source: varchar('source', { length: SENTIMENT_SOURCE_MAX_LENGTH }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('sentiment_observations_source_date_observed_at_unique').on(
      table.source,
      table.date,
      table.observedAt,
    ),
    index('sentiment_observations_source_observed_at_idx').on(table.source, table.observedAt),
    check(
      'sentiment_observations_fear_greed_range_check',
      sql`${table.fearGreed} between 0 and 100`,
    ),
  ],
);
