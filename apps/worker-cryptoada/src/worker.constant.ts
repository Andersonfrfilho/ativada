// Copyright (c) 2026 Ada Technology. All rights reserved.
export const DEFAULT_MARKET_EXCHANGE = 'binance';
export const DEFAULT_MARKET_SYMBOLS = 'BTCUSDT,ETHUSDT';
export const DEFAULT_MARKET_TIMEFRAMES = '15m,1h,4h,1d';
export const MARKET_LIST_SEPARATOR = ',';
export const SYMBOL_PATTERN = /^[A-Z0-9]{5,20}$/;
export const DEFAULT_STREAM_STALE_SECONDS = 60;
export const MINIMUM_STREAM_STALE_SECONDS = 5;
export const MAXIMUM_STREAM_STALE_SECONDS = 600;
export const DEFAULT_STREAM_GAP_LOOKBACK_HOURS = 168;
export const MINIMUM_STREAM_GAP_LOOKBACK_HOURS = 1;
export const MAXIMUM_STREAM_GAP_LOOKBACK_HOURS = 720;
export const DEFAULT_STREAM_GAP_CHECK_MINUTES = 15;
export const MINIMUM_STREAM_GAP_CHECK_MINUTES = 1;
export const MAXIMUM_STREAM_GAP_CHECK_MINUTES = 1_440;
export const MILLISECONDS_PER_MINUTE = 60_000;
export const MILLISECONDS_PER_HOUR = 3_600_000;
export const CANDLE_WRITE_MAX_ATTEMPTS = 3;
export const CANDLE_WRITE_RETRY_BASE_MILLISECONDS = 200;
export const SHUTDOWN_TIMEOUT_MILLISECONDS = 10_000;
// As primeiras descartadas sempre saem no log; depois, uma a cada 100, para um feed quebrado não inundar.
export const MALFORMED_LOG_ALWAYS_UNTIL = 10;
export const MALFORMED_LOG_EVERY = 100;

export const WORKER_LOG = {
  STARTED: 'worker started',
  STREAM_CONNECTED: 'stream connected',
  STREAM_DISCONNECTED: 'stream disconnected',
  MALFORMED: 'stream message discarded',
  CANDLE_STORED: 'candle stored',
  CANDLE_WRITE_FAILED: 'candle write failed',
  CANDLE_WRITE_RETRY: 'candle write retry scheduled',
  NO_STORED_CANDLES: 'gap recovery skipped: no stored candles, left to the backfill',
  GAP_RECOVERED: 'gap recovered',
  GAP_RECOVERY_FINISHED: 'gap recovery finished',
  GAP_RECOVERY_FAILED: 'gap recovery failed',
  GAP_RECOVERY_RETRY: 'gap recovery retry scheduled',
  SHUTDOWN_STARTED: 'shutdown started',
  SHUTDOWN_TIMED_OUT: 'shutdown timed out',
  SHUTDOWN_COMPLETE: 'shutdown complete',
  SHUTDOWN_FAILED: 'shutdown failed',
} as const;
