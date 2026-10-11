// Copyright (c) 2026 Ada Technology. All rights reserved.
export const FEAR_GREED_CREDIT_TEXT = 'Fear & Greed Index por alternative.me';
export const FEAR_GREED_CREDIT_URL = 'https://alternative.me/crypto/fear-and-greed-index/';
export const EXTERNAL_LINK_REL = 'noopener noreferrer';

export const PAGE_SIZE = 100;
export const RUN_KIND_LIVE_PAPER = 'live_paper';
// Os pontos mais recentes vêm com `order=desc` (uma página só, sem varrer a série inteira).
export const NEWEST_PAGE_QUERY = `limit=${PAGE_SIZE}&order=desc`;
export const LATEST_SIGNALS_COUNT = 5;
export const SPARKLINE_MAX_POINTS = 120;

export const PRICE_TIMEFRAME = '1h';
export const PRICE_HISTORY_HOURS = 26;
export const PRICE_CHANGE_HOURS = 24;
export const MILLISECONDS_PER_HOUR = 3_600_000;
export const STALE_TIME_MILLISECONDS = 15_000;
export const FALLBACK_POLL_MILLISECONDS = 15_000;

export const RUN_STATUS = {
  QUEUED: 'queued',
  RUNNING: 'running',
  COMPLETED: 'completed',
  FAILED: 'failed',
  CANCELLED: 'cancelled',
} as const;

export const SIGNAL_ACTION = { BUY: 'BUY', SELL: 'SELL', HOLD: 'HOLD' } as const;

export const SIGNAL_LABEL: Readonly<Record<string, string>> = {
  BUY: 'Compra',
  SELL: 'Venda',
  HOLD: 'Neutro',
};
