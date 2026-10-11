// Copyright (c) 2026 Ada Technology. All rights reserved.
import type {
  FearGreedEntry,
  FindFearGreedParams,
  SentimentRepository,
} from '../../packages/database/src/index.js';

export type InMemorySentimentRepository = SentimentRepository & {
  readonly stored: () => readonly FearGreedEntry[];
  readonly upsertCalls: () => number;
};

export function createInMemorySentimentRepository(
  seed: readonly FearGreedEntry[] = [],
): InMemorySentimentRepository {
  const rows = new Map<string, FearGreedEntry>(seed.map((entry) => [entry.date, entry]));
  let upsertCalls = 0;
  const sortedRows = (): readonly FearGreedEntry[] =>
    [...rows.values()].sort((left, right) => left.date.localeCompare(right.date));
  return {
    stored: sortedRows,
    upsertCalls: (): number => upsertCalls,
    upsertFearGreed: (entries): Promise<void> => {
      upsertCalls += 1;
      for (const entry of entries) rows.set(entry.date, entry);
      return Promise.resolve();
    },
    findFearGreed: (params: FindFearGreedParams): Promise<readonly FearGreedEntry[]> =>
      Promise.resolve(
        sortedRows().filter((entry) => entry.date >= params.from && entry.date < params.to),
      ),
    findLatestDate: (): Promise<string | undefined> => Promise.resolve(sortedRows().at(-1)?.date),
    findLatest: (): Promise<FearGreedEntry | undefined> => Promise.resolve(sortedRows().at(-1)),
  };
}
