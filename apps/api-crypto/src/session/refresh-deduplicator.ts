// Copyright (c) 2026 Ada Technology. All rights reserved.
import { createRecencyMap } from '../shared/collections/recency-map.js';
import { hashSecret } from '../shared/crypto/hash-secret.js';
import { MAX_DEDUPLICATED_REFRESHES } from './session.constant.js';

export type RefreshDeduplicatorOptions = {
  readonly now: () => number;
  readonly windowMilliseconds: number;
  readonly maximumEntries?: number;
};

export type DeduplicateRefreshParams<TOutcome> = {
  readonly refreshToken: string;
  readonly perform: () => Promise<TOutcome>;
  readonly shouldRetain: (outcome: TOutcome) => boolean;
};

export type RefreshDeduplicator<TOutcome> = {
  readonly run: (params: DeduplicateRefreshParams<TOutcome>) => Promise<TOutcome>;
};

type Entry<TOutcome> = {
  readonly expiresAtMilliseconds: number;
  readonly outcome: Promise<TOutcome>;
};

export function createRefreshDeduplicator<TOutcome>(
  options: RefreshDeduplicatorOptions,
): RefreshDeduplicator<TOutcome> {
  const entries = createRecencyMap<Entry<TOutcome>>({
    maximumEntries: options.maximumEntries ?? MAX_DEDUPLICATED_REFRESHES,
    isIdle: (entry) => entry.expiresAtMilliseconds <= options.now(),
  });

  function run(params: DeduplicateRefreshParams<TOutcome>): Promise<TOutcome> {
    const nowMilliseconds = options.now();
    const key = hashSecret(params.refreshToken);
    const existing = entries.get(key);
    if (existing !== undefined && existing.expiresAtMilliseconds > nowMilliseconds) {
      return existing.outcome;
    }
    const outcome = params.perform();
    entries.set(key, {
      expiresAtMilliseconds: nowMilliseconds + options.windowMilliseconds,
      outcome,
    });
    void outcome.then(
      (result) => {
        if (!params.shouldRetain(result)) entries.delete(key);
      },
      () => entries.delete(key),
    );
    return outcome;
  }

  return { run };
}
