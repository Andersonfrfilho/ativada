// Copyright (c) 2026 Ada Technology. All rights reserved.
import { and, asc, gte, lt, max, sql } from 'drizzle-orm';

import { readOpenDatabase, type DatabaseHandle } from '../database-handle.js';
import { sentimentDaily } from '../schema/sentiment-daily.schema.js';
import type {
  FearGreedEntry,
  FindFearGreedParams,
  SentimentRepository,
} from './sentiment.types.js';

type SentimentDatabase = ReturnType<typeof readOpenDatabase>['database'];

async function upsertFearGreed(
  database: SentimentDatabase,
  entries: readonly FearGreedEntry[],
): Promise<void> {
  if (entries.length === 0) return;
  await database
    .insert(sentimentDaily)
    .values(
      entries.map((entry) => ({
        date: entry.date,
        fearGreed: entry.fearGreed,
        classification: entry.classification ?? null,
      })),
    )
    .onConflictDoUpdate({
      target: sentimentDaily.date,
      set: {
        fearGreed: sql`excluded.fear_greed`,
        classification: sql`excluded.classification`,
      },
    });
}

async function findFearGreed(
  database: SentimentDatabase,
  params: FindFearGreedParams,
): Promise<readonly FearGreedEntry[]> {
  const rows = await database
    .select()
    .from(sentimentDaily)
    .where(and(gte(sentimentDaily.date, params.from), lt(sentimentDaily.date, params.to)))
    .orderBy(asc(sentimentDaily.date));
  return rows.map((row) => ({
    date: row.date,
    fearGreed: row.fearGreed,
    classification: row.classification ?? undefined,
  }));
}

async function findLatestDate(database: SentimentDatabase): Promise<string | undefined> {
  const [row] = await database.select({ latest: max(sentimentDaily.date) }).from(sentimentDaily);
  return row?.latest ?? undefined;
}

export function createSentimentRepository(handle: DatabaseHandle): SentimentRepository {
  const { database } = readOpenDatabase(handle);
  return {
    upsertFearGreed: (entries) => upsertFearGreed(database, entries),
    findFearGreed: (params) => findFearGreed(database, params),
    findLatestDate: () => findLatestDate(database),
  };
}
