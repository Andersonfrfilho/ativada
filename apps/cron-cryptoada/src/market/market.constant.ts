// Copyright (c) 2026 Ada Technology. All rights reserved.
export const DEFAULT_BACKFILL_YEARS = 2;
export const MINIMUM_BACKFILL_YEARS = 1;
export const MAXIMUM_BACKFILL_YEARS = 5;
export const DEFAULT_FEAR_GREED_REFRESH_DAYS = 14;
export const MINIMUM_FEAR_GREED_REFRESH_DAYS = 1;
export const MAXIMUM_FEAR_GREED_REFRESH_DAYS = 365;
// `limit=0` pede à alternative.me todo o histórico.
export const FEAR_GREED_FULL_HISTORY_LIMIT = 0;
export const MILLISECONDS_PER_DAY = 86_400_000;
export const MISSING_DAYS_MARGIN = 2;

export const BACKFILL_LOG = {
  UNFILLABLE: 'backfill gap unfillable',
  PAIR_FAILED: 'backfill pair failed',
  BANNED: 'backfill banned',
  SERVER_CLOCK_UNAVAILABLE: 'server clock unavailable, using the local clock',
} as const;
