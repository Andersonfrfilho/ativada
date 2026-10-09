// Copyright (c) 2026 Ada Technology. All rights reserved.
export const CANDLE_TIMEFRAMES = ['15m', '1h', '4h', '1d'] as const;

// 11 colunas por linha: 1000 linhas usam 11000 parâmetros, longe do teto de 65535 do Postgres.
export const CANDLE_INSERT_BATCH_SIZE = 1_000;
