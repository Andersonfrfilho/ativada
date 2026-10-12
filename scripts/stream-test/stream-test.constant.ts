// Copyright (c) 2026 Ada Technology. All rights reserved.
export const TEMPORARY_DATABASE_PREFIX = 'ativada_stream_';
export const WORKER_ENTRYPOINT = 'apps/worker-ativada/src/main.ts';
export const EXCHANGE = 'binance';
export const SYMBOL = 'BTCUSDT';
export const TIMEFRAME = '1h';
export const MILLISECONDS_PER_HOUR = 3_600_000;
export const STREAM_STALE_SECONDS = '30';
export const SEEDED_HOURS = 17;
export const HOURS_BEFORE_LAST_CLOSED_AT_SEED_START = 20;
export const LOST_CANDLE_COUNT = 3;

export const WAIT_TIMEOUT_MILLISECONDS = 30_000;
export const RECONNECT_TIMEOUT_MILLISECONDS = 30_000;
export const SHUTDOWN_TIMEOUT_MILLISECONDS = 15_000;
export const SHUTDOWN_BUDGET_MILLISECONDS = 3_000;
export const POLL_INTERVAL_MILLISECONDS = 50;

export const WORKER_MESSAGE = {
  CONNECTED: 'stream connected',
  RECOVERY_FINISHED: 'gap recovery finished',
  MALFORMED: 'stream message discarded',
  CANDLE_STORED: 'candle stored',
  SHUTDOWN_COMPLETE: 'shutdown complete',
  SHUTDOWN_TIMED_OUT: 'shutdown timed out',
} as const;
