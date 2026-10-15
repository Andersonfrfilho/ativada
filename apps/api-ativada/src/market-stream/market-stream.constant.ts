// Copyright (c) 2026 Ada Technology. All rights reserved.
export const MARKET_TOPIC_PREFIX = 'market:';
export const PAIR_PATTERN = /^[A-Z0-9]{2,20}$/;
export const MAX_PAIRS_PER_MESSAGE = 50;

export const MARKET_SERVER_MESSAGE_TYPE = {
  TICK: 'tick',
  CANDLE: 'candle',
  SUBSCRIBED: 'subscribed',
} as const;

export const MARKET_CLIENT_MESSAGE_TYPE = {
  SUBSCRIBE: 'subscribe',
  UNSUBSCRIBE: 'unsubscribe',
} as const;

// Erros TIPADOS da assinatura: o painel decide pelo `code`, nunca pelo texto.
export const MARKET_ERROR_CODE = {
  PAIR_NOT_SUPPORTED: 'PAIR_NOT_SUPPORTED',
  TOO_MANY_PAIRS: 'TOO_MANY_PAIRS',
  MARKET_UNAVAILABLE: 'MARKET_UNAVAILABLE',
} as const;

export type MarketErrorCode = (typeof MARKET_ERROR_CODE)[keyof typeof MARKET_ERROR_CODE];

// Passo do varredor do selo de dado velho: o painel precisa do aviso em poucos segundos, não ao fim de um minuto.
export const STALE_SWEEP_INTERVAL_MILLISECONDS = 1_000;
