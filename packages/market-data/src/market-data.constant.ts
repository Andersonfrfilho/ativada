// Copyright (c) 2026 Ada Technology. All rights reserved.

// Base só de dados de mercado públicos, sem restrição de região e sem chave (docs da Binance, "General API Information").
export const BINANCE_MARKET_DATA_BASE_URL = 'https://data-api.binance.vision';
export const BINANCE_SOURCE_NAME = 'Binance';
export const KLINES_PATH = '/api/v3/klines';
export const SYMBOL_PATTERN = /^[A-Z0-9]{2,20}$/;
export const MAX_KLINES_PER_REQUEST = 1_000;
export const USED_WEIGHT_HEADER = 'x-mbx-used-weight-1m';
export const RETRY_AFTER_HEADER = 'retry-after';
export const WEIGHT_WINDOW_MILLISECONDS = 60_000;
export const MILLISECONDS_PER_SECOND = 1_000;
export const HTTP_STATUS_TOO_MANY_REQUESTS = 429;
export const HTTP_STATUS_IP_BANNED = 418;
export const HTTP_STATUS_SERVER_ERROR_MINIMUM = 500;
export const TIMEOUT_ERROR_NAME = 'TimeoutError';

export const DEFAULT_CLIENT_SETTINGS = {
  weightCeiling: 6_000,
  weightSafetyMargin: 600,
  maxAttempts: 4,
  requestTimeoutMilliseconds: 10_000,
  backoffBaseMilliseconds: 500,
  backoffMaxMilliseconds: 8_000,
} as const;

// Termos da alternative.me: API pública sem chave; exibir o índice exige crédito e link.
export const FEAR_GREED_API_URL = 'https://api.alternative.me/fng/';
export const FEAR_GREED_SOURCE_NAME = 'alternative.me';
export const FEAR_GREED_FORMAT = 'json';

// Stream combinado só de dados de mercado (sem user data stream), indicado pela documentação de WebSocket Streams da Binance.
export const BINANCE_STREAM_BASE_URL = 'wss://data-stream.binance.vision';

export const SERVER_TIME_PATH = '/api/v3/time';
export const DEFAULT_SERVER_CLOCK_REFRESH_MILLISECONDS = 600_000;
export const SERVER_TIME_TIMEOUT_MILLISECONDS = 5_000;
