// Copyright (c) 2026 Ada Technology. All rights reserved.

// Uma só conexão com `<par>@miniTicker` de cada par habilitado (stream combinado): a Binance já empurra um por segundo por
// par, então a banda é de poucos KB/s. `!miniTicker@arr` mandaria o mercado inteiro (centenas de KB/s) para usar dois pares.
export const MINI_TICKER_STREAM_SUFFIX = '@miniTicker';
export const MINI_TICKER_EVENT_TYPE = '24hrMiniTicker';
// No máximo uma publicação por segundo por par (RF16).
export const TICK_PUBLISH_INTERVAL_MILLISECONDS = 1_000;
export const PERCENT_DECIMAL_PLACES = 4;
export const DECIMAL_PATTERN = /^\d+(\.\d+)?$/;

// O ticker empurra um evento por segundo por par: 30 s de silêncio é conexão morta.
export const DEFAULT_TICKER_STREAM_SETTINGS = {
  staleAfterMilliseconds: 30_000,
  reconnectBaseMilliseconds: 2_000,
  reconnectMaxMilliseconds: 60_000,
  stableAfterMilliseconds: 60_000,
} as const;
