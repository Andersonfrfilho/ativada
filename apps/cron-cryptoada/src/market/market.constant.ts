// Copyright (c) 2026 Ada Technology. All rights reserved.
export const DEFAULT_MARKET_EXCHANGE = 'binance';
export const DEFAULT_MARKET_SYMBOLS = 'BTCUSDT,ETHUSDT';
export const DEFAULT_MARKET_TIMEFRAMES = '15m,1h,4h,1d';
export const DEFAULT_BACKFILL_YEARS = 2;
export const MINIMUM_BACKFILL_YEARS = 1;
export const MAXIMUM_BACKFILL_YEARS = 5;
export const MARKET_LIST_SEPARATOR = ',';
export const SYMBOL_PATTERN = /^[A-Z0-9]{5,20}$/;

export const BACKFILL_LOG = {
  UNFILLABLE: 'backfill gap unfillable',
  PAIR_FAILED: 'backfill pair failed',
} as const;
