// Copyright (c) 2026 Ada Technology. All rights reserved.
// Velas de execução: as únicas que o motor lê (iguais ao TIMEFRAME do mercado e ao ENGINE_TIMEFRAME).
export const RUN_CANDLE_TIMEFRAMES = ['15m', '1h', '4h', '1d'] as const;
// Velas só de exibição (spec 017): retenção curta, nunca timeframe de execução.
export const DISPLAY_CANDLE_TIMEFRAMES = ['3m'] as const;
export const CANDLE_TIMEFRAMES = [...RUN_CANDLE_TIMEFRAMES, ...DISPLAY_CANDLE_TIMEFRAMES] as const;
// Lote do expurgo das velas de exibição vencidas.
export const DISPLAY_CANDLE_PURGE_BATCH_SIZE = 5_000;

// 11 colunas por linha: 1000 linhas usam 11000 parâmetros, longe do teto de 65535 do Postgres.
export const CANDLE_INSERT_BATCH_SIZE = 1_000;

// Folga entre o relógio local e o da Binance: vela `x=true` do stream não se perde por relógio atrasado.
export const CLOCK_SKEW_TOLERANCE_MILLISECONDS = 5_000;

const MILLISECONDS_PER_MINUTE = 60_000;

// Espelha market-data (este pacote não depende dele); test/timeframe-tables.contract.test.ts prende a igualdade.

export const CANDLE_TIMEFRAME_DURATION_MILLISECONDS: Readonly<
  Record<(typeof CANDLE_TIMEFRAMES)[number], number>
> = {
  '15m': 15 * MILLISECONDS_PER_MINUTE,
  '1h': 60 * MILLISECONDS_PER_MINUTE,
  '4h': 240 * MILLISECONDS_PER_MINUTE,
  '1d': 1_440 * MILLISECONDS_PER_MINUTE,
  '3m': 3 * MILLISECONDS_PER_MINUTE,
};
