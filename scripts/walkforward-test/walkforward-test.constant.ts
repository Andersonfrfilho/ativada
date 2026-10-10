// Copyright (c) 2026 Ada Technology. All rights reserved.
export const TEMPORARY_DATABASE_PREFIX = 'crypto_walkforward_';
export const EXCHANGE = 'binance';
export const SENTIMENT_SOURCE = 'alternative.me';
export const HOUR_MILLISECONDS = 3_600_000;
export const DAY_MILLISECONDS = 86_400_000;
export const THREAD_TIMEOUT_MILLISECONDS = 1_800_000;
export const HEALTH_BUDGET_MILLISECONDS = 100;
export const PAGE_SIZE = 5_000;
export const TWO_YEARS_OF_HOURLY_CANDLES = 17_520;
// 175.000 candles: cinco anos em `15m` (a extrapolação do RNF02).
export const FIVE_YEARS_OF_FIFTEEN_MINUTE_CANDLES = 175_000;
export const SERIES_FIRST_OPEN_TIME = Date.UTC(2023, 0, 1);
export const PERIOD_START = Date.UTC(2023, 0, 10);
export const PERIOD_END = Date.UTC(2025, 0, 1);
export const CANCEL_AT_PROGRESS = 30;
export const RESUME_KILL_AT_PROGRESS = 97;
export const SYMBOLS = {
  OVERFITTING: 'BTCUSDT',
  TRENDING: 'SOLUSDT',
  TIMING: 'BNBUSDT',
  REAL_DAILY: 'ETHUSDT',
  REAL_HOURLY: 'BTCUSDT',
} as const;
