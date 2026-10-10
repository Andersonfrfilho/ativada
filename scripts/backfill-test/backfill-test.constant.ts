// Copyright (c) 2026 Ada Technology. All rights reserved.
export const TEMPORARY_DATABASE_PREFIX = 'crypto_backfill_';
export const CRON_ENTRYPOINT = 'apps/cron-cryptoada/src/main.ts';
export const BACKFILL_TASK_NAME = 'backfill-candles';
export const KLINES_PATH = '/api/v3/klines';
export const PAGE_SIZE = 1_000;
export const EXCHANGE = 'binance';
export const HTTP_SERVER_ERROR = 500;
export const LOOPBACK_HOST = '127.0.0.1';

export const MILLISECONDS_PER_HOUR = 3_600_000;
export const DURATION_MILLISECONDS = {
  '15m': 900_000,
  '1h': MILLISECONDS_PER_HOUR,
  '4h': 4 * MILLISECONDS_PER_HOUR,
  '1d': 24 * MILLISECONDS_PER_HOUR,
} as const;

export type BackfillTimeframe = keyof typeof DURATION_MILLISECONDS;

export const CLOCK_SAFETY_MARGIN = {
  AFTER_BOUNDARY_MILLISECONDS: 5_000,
  BEFORE_BOUNDARY_MILLISECONDS: 120_000,
} as const;

export const FEAR_GREED_TASK_NAME = 'sync-fear-greed';
export const FEAR_GREED_PATH = '/fng/';
export const FEAR_GREED_HISTORY_DAYS = 40;
export const FEAR_GREED_REFRESH_DAYS = 14;
export const MILLISECONDS_PER_DAY = 24 * MILLISECONDS_PER_HOUR;
