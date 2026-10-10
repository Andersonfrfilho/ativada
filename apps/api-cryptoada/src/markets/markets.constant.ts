// Copyright (c) 2026 Ada Technology. All rights reserved.
export const CANDLES_PATH = '/v1/markets/candles';

// Teto de candles por resposta (RF01/T3.4): o intervalo pedido é recusado antes de ir ao banco.
export const MAX_CANDLES_PER_RESPONSE = 5_000;

export const CANDLE_QUERY_REASON = {
  NOT_ENABLED: 'not_enabled',
  MUST_BE_AFTER_FROM: 'must_be_after_from',
  RANGE_TOO_LARGE: 'range_too_large',
} as const;

export const TIMESTAMP_PATTERN = /^\d{1,16}$/;
