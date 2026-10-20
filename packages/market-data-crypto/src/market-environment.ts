// Copyright (c) 2026 Ada Technology. All rights reserved.
import { commaSeparatedTextSchema, z } from '@ativada/environment';

import {
  CONFIGURED_SYMBOL_PATTERN,
  DEFAULT_CANDLE_DISPLAY_1M_RETENTION_DAYS,
  DEFAULT_CANDLE_DISPLAY_RETENTION_DAYS,
  DEFAULT_MARKET_DISPLAY_TIMEFRAMES,
  DEFAULT_MARKET_EXCHANGE,
  MAXIMUM_CANDLE_DISPLAY_1M_RETENTION_DAYS,
  MAXIMUM_CANDLE_DISPLAY_RETENTION_DAYS,
  MINIMUM_CANDLE_DISPLAY_1M_RETENTION_DAYS,
  MINIMUM_CANDLE_DISPLAY_RETENTION_DAYS,
  DEFAULT_MARKET_SYMBOLS,
  DEFAULT_MARKET_TIMEFRAMES,
  SUPPORTED_MARKET_EXCHANGES,
} from './market-data.constant.js';
import { hasKnownSymbolFilters } from './symbol-filters.constant.js';
import { DISPLAY_TIMEFRAME, TIMEFRAME } from './timeframe.constant.js';

const EXCHANGE_EXPECTATION = `uma das corretoras suportadas: ${SUPPORTED_MARKET_EXCHANGES.join(', ')}`;
const SYMBOL_EXPECTATION = 'símbolos em maiúsculas separados por vírgula (ex.: BTCUSDT,ETHUSDT)';
const TIMEFRAME_EXPECTATION = 'timeframes separados por vírgula dentre 15m, 1h, 4h e 1d';
const DISPLAY_TIMEFRAME_EXPECTATION =
  'timeframes de exibição separados por vírgula (1m, 3m) ou vazio';
const RETENTION_EXPECTATION = `inteiro de ${MINIMUM_CANDLE_DISPLAY_RETENTION_DAYS} a ${MAXIMUM_CANDLE_DISPLAY_RETENTION_DAYS}`;
const RETENTION_1M_EXPECTATION = `inteiro de ${MINIMUM_CANDLE_DISPLAY_1M_RETENTION_DAYS} a ${MAXIMUM_CANDLE_DISPLAY_1M_RETENTION_DAYS}`;

// Vazio é válido (nenhuma vela de exibição); o resto precisa ser timeframe de exibição conhecido.
const displayTimeframesSchema = commaSeparatedTextSchema.transform((entries) =>
  entries.filter((entry) => entry !== ''),
);

// O erro de ambiente só cita a variável: o par sem filtro precisa constar na própria mensagem. Texto fora do formato
// não é citado (o regex já o reprova).
function isMissingFilters(symbol: unknown): symbol is string {
  return (
    typeof symbol === 'string' &&
    CONFIGURED_SYMBOL_PATTERN.test(symbol) &&
    !hasKnownSymbolFilters(symbol)
  );
}

function describeMissingFilters(input: unknown): string {
  const missing = Array.isArray(input) ? input.filter(isMissingFilters) : [];
  return `pares com filtros conhecidos em BINANCE_SYMBOL_FILTERS; sem filtros: ${missing.join(', ')}`;
}

export const marketEnvironmentShape = {
  MARKET_EXCHANGE: z
    .enum(SUPPORTED_MARKET_EXCHANGES, { error: EXCHANGE_EXPECTATION })
    .default(DEFAULT_MARKET_EXCHANGE),
  MARKET_SYMBOLS: commaSeparatedTextSchema
    .pipe(
      z
        .array(z.string().regex(CONFIGURED_SYMBOL_PATTERN), { error: SYMBOL_EXPECTATION })
        .min(1)
        .refine((symbols) => !symbols.some(isMissingFilters), {
          error: (issue) => describeMissingFilters(issue.input),
        }),
    )
    .prefault(DEFAULT_MARKET_SYMBOLS),
  MARKET_TIMEFRAMES: commaSeparatedTextSchema
    .pipe(z.array(z.enum(TIMEFRAME), { error: TIMEFRAME_EXPECTATION }).min(1))
    .prefault(DEFAULT_MARKET_TIMEFRAMES),
  MARKET_DISPLAY_TIMEFRAMES: displayTimeframesSchema
    .pipe(z.array(z.enum(DISPLAY_TIMEFRAME), { error: DISPLAY_TIMEFRAME_EXPECTATION }))
    .prefault(DEFAULT_MARKET_DISPLAY_TIMEFRAMES),
  CANDLE_DISPLAY_RETENTION_DAYS: z.coerce
    .number({ error: RETENTION_EXPECTATION })
    .int({ error: RETENTION_EXPECTATION })
    .min(MINIMUM_CANDLE_DISPLAY_RETENTION_DAYS, { error: RETENTION_EXPECTATION })
    .max(MAXIMUM_CANDLE_DISPLAY_RETENTION_DAYS, { error: RETENTION_EXPECTATION })
    .default(DEFAULT_CANDLE_DISPLAY_RETENTION_DAYS),
  CANDLE_DISPLAY_1M_RETENTION_DAYS: z.coerce
    .number({ error: RETENTION_1M_EXPECTATION })
    .int({ error: RETENTION_1M_EXPECTATION })
    .min(MINIMUM_CANDLE_DISPLAY_1M_RETENTION_DAYS, { error: RETENTION_1M_EXPECTATION })
    .max(MAXIMUM_CANDLE_DISPLAY_1M_RETENTION_DAYS, { error: RETENTION_1M_EXPECTATION })
    .default(DEFAULT_CANDLE_DISPLAY_1M_RETENTION_DAYS),
};
