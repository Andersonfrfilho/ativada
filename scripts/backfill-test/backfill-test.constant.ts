// Copyright (c) 2026 Ada Technology. All rights reserved.
export const TEMPORARY_DATABASE_PREFIX = 'crypto_backfill_';
export const CRON_ENTRYPOINT = 'apps/cron-cryptoada/src/main.ts';
export const BACKFILL_TASK_NAME = 'backfill-candles';
export const FINISHED_MESSAGE = `${BACKFILL_TASK_NAME} finished`;
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
