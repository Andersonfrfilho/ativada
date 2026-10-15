// Copyright (c) 2026 Ada Technology. All rights reserved.

// A regra pura da previsão (ADR 0002, spec 009, P3): mudar qualquer conta exige `projection-2` e o dourado regravado.
export const PROJECTION_RULE_VERSION = 'projection-1';
export const STRATEGY_LAYERS_VERSION = 'layers-1';

// Teto de velas de uma página de camadas (ADR 0002, spec 009, P1): acima disso a resposta passa de 250 KB.
export const STRATEGY_LAYERS_MAXIMUM_CANDLES = 1_000;
export const PROJECTIONS_PAGE_SIZE = { DEFAULT: 24, MAXIMUM: 100 } as const;

// A faixa tem as 8 casas do dinheiro (nunca encolhe) e as taxas, 4 (2 em porcentagem), sempre para baixo.
export const PROJECTION_BAND_DECIMAL_PLACES = 8;
export const PROJECTION_RATE_DECIMAL_PLACES = 4;

export const PROJECTION_SIDE = { BUY: 'buy', SELL: 'sell', NONE: 'none' } as const;
export type ProjectionSide = (typeof PROJECTION_SIDE)[keyof typeof PROJECTION_SIDE];

export const PROJECTION_STRENGTH = { WEAK: 'weak', STRONG: 'strong', DECIDED: 'decided' } as const;
export type ProjectionStrength = (typeof PROJECTION_STRENGTH)[keyof typeof PROJECTION_STRENGTH];

export const PROJECTION_STANCE = {
  BUY: 'buy',
  HOLD: 'hold',
  SELL: 'sell',
  STAY_OUT: 'stay_out',
} as const;
export type ProjectionStance = (typeof PROJECTION_STANCE)[keyof typeof PROJECTION_STANCE];

export const PROJECTION_RESULT = {
  HIT: 'hit',
  MISS: 'miss',
  TIE: 'tie',
  NO_SIDE: 'no_side',
  PENDING: 'pending',
  GAP: 'gap',
} as const;
export type ProjectionResult = (typeof PROJECTION_RESULT)[keyof typeof PROJECTION_RESULT];

// Por que não há tendência agora, na ordem de precedência (ADR 0002, spec 009, P7).
export const PROJECTION_UNAVAILABLE_REASON = {
  NOT_RUNNING: 'not_running',
  NO_CANDLE: 'no_candle',
  WARMING_UP: 'warming_up',
  NEUTRAL: 'neutral',
} as const;
export type ProjectionUnavailableReason =
  (typeof PROJECTION_UNAVAILABLE_REASON)[keyof typeof PROJECTION_UNAVAILABLE_REASON];

// As linhas da estratégia sobre o preço, por papel (ADR 0002, spec 009, P2).
export const LAYER_LINE_ROLE = {
  CHANNEL_UPPER: 'channel_upper',
  CHANNEL_LOWER: 'channel_lower',
  EMA_FAST: 'ema_fast',
  EMA_SLOW: 'ema_slow',
  BAND_UPPER: 'band_upper',
  BAND_MIDDLE: 'band_middle',
  BAND_LOWER: 'band_lower',
} as const;
export type LayerLineRole = (typeof LAYER_LINE_ROLE)[keyof typeof LAYER_LINE_ROLE];

export const LAYER_QUERY_FIELD = { TO: 'to' } as const;
export const LAYER_QUERY_REASON = { RANGE_TOO_LARGE: 'range_too_large' } as const;
