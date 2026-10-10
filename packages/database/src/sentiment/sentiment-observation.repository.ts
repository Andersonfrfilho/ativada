// Copyright (c) 2026 Ada Technology. All rights reserved.
import { and, asc, desc, eq, getTableColumns, lte } from 'drizzle-orm';

import { readOpenDatabase, type DatabaseHandle } from '../database-handle.js';
import type { DatabaseExecutor } from '../database-executor.js';
import { chunkRows } from '../run-results/run-result-merge.js';
import { sentimentObservations } from '../schema/sentiment-observations.schema.js';
import type {
  AppendObservationsResult,
  FindAvailableObservationParams,
  SentimentObservationInput,
  SentimentObservationRecord,
  SentimentObservationRepository,
} from './sentiment-observation.types.js';

const OBSERVATION_COLUMNS = {
  source: sentimentObservations.source,
  date: sentimentObservations.date,
  fearGreed: sentimentObservations.fearGreed,
  observedAt: sentimentObservations.observedAt,
  createdAt: sentimentObservations.createdAt,
} as const;

const OBSERVATION_COLUMN_COUNT = Object.keys(getTableColumns(sentimentObservations)).length;

function isAvailable(params: FindAvailableObservationParams): ReturnType<typeof and> {
  return and(
    eq(sentimentObservations.source, params.source),
    lte(sentimentObservations.observedAt, params.observedUntil),
    lte(sentimentObservations.createdAt, params.insertedUntil),
  );
}

// Append-only: a chave (fonte, data, observed_at) repetida é ignorada; nada é atualizado.
async function appendObservations(
  executor: DatabaseExecutor,
  rows: readonly SentimentObservationInput[],
): Promise<AppendObservationsResult> {
  let inserted = 0;
  for (const chunk of chunkRows(rows, OBSERVATION_COLUMN_COUNT)) {
    const stored = await executor
      .insert(sentimentObservations)
      .values(chunk.map((row) => ({ id: Bun.randomUUIDv7(), ...row })))
      .onConflictDoNothing({
        target: [
          sentimentObservations.source,
          sentimentObservations.date,
          sentimentObservations.observedAt,
        ],
      })
      .returning({ id: sentimentObservations.id });
    inserted += stored.length;
  }
  return { inserted };
}

async function findAvailableAt(
  executor: DatabaseExecutor,
  params: FindAvailableObservationParams,
): Promise<SentimentObservationRecord | undefined> {
  const rows = await executor
    .select(OBSERVATION_COLUMNS)
    .from(sentimentObservations)
    .where(isAvailable(params))
    .orderBy(
      desc(sentimentObservations.observedAt),
      desc(sentimentObservations.createdAt),
      desc(sentimentObservations.id),
    )
    .limit(1);
  return rows[0];
}

async function listAvailable(
  executor: DatabaseExecutor,
  params: FindAvailableObservationParams,
): Promise<readonly SentimentObservationRecord[]> {
  return executor
    .select(OBSERVATION_COLUMNS)
    .from(sentimentObservations)
    .where(isAvailable(params))
    .orderBy(
      asc(sentimentObservations.observedAt),
      asc(sentimentObservations.createdAt),
      asc(sentimentObservations.id),
    );
}

export function createSentimentObservationRepository(
  handle: DatabaseHandle,
): SentimentObservationRepository {
  const { database } = readOpenDatabase(handle);
  return {
    appendObservations: (rows) => appendObservations(database, rows),
    findAvailableAt: (params) => findAvailableAt(database, params),
    listAvailable: (params) => listAvailable(database, params),
  };
}
