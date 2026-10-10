// Copyright (c) 2026 Ada Technology. All rights reserved.

export const STREAM_PATH = '/stream';
export const STREAMS_QUERY_PREFIX = '?streams=';
export const STREAM_NAME_SEPARATOR = '/';
export const KLINE_STREAM_SUFFIX = '@kline_';
export const KLINE_EVENT_TYPE = 'kline';
export const WEBSOCKET_PROTOCOLS: readonly string[] = ['ws:', 'wss:'];
// Limite documentado da Binance: uma conexão escuta no máximo 1024 streams.
export const MAX_STREAMS_PER_CONNECTION = 1_024;

// A Binance envia ping a cada 20 s; 60 s sem nenhuma mensagem é conexão morta.
export const DEFAULT_KLINE_STREAM_SETTINGS = {
  staleAfterMilliseconds: 60_000,
  // Limite da Binance: 300 tentativas de conexão por 5 min por IP; a espera mínima é metade da base.
  reconnectBaseMilliseconds: 2_000,
  reconnectMaxMilliseconds: 60_000,
  stableAfterMilliseconds: 60_000,
} as const;

export const DISCONNECT_REASON = {
  SERVER_CLOSED: 'server-closed',
  CONNECTION_FAILED: 'connection-failed',
  STALE: 'stale',
  CLOSED_BY_CONSUMER: 'closed-by-consumer',
} as const;

export const MALFORMED_REASON = {
  NOT_TEXT: 'not-text',
  INVALID_JSON: 'invalid-json',
  UNKNOWN_SHAPE: 'unknown-shape',
  UNSUBSCRIBED: 'unsubscribed',
} as const;
