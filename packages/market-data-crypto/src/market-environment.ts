// Copyright (c) 2026 Ada Technology. All rights reserved.
import { commaSeparatedTextSchema, z } from '@ativada/environment';

import {
  CONFIGURED_SYMBOL_PATTERN,
  DEFAULT_MARKET_EXCHANGE,
  DEFAULT_MARKET_SYMBOLS,
  DEFAULT_MARKET_TIMEFRAMES,
  SUPPORTED_MARKET_EXCHANGES,
} from './market-data.constant.js';
import { TIMEFRAME } from './timeframe.constant.js';

const EXCHANGE_EXPECTATION = `uma das corretoras suportadas: ${SUPPORTED_MARKET_EXCHANGES.join(', ')}`;
const SYMBOL_EXPECTATION = 'símbolos em maiúsculas separados por vírgula (ex.: BTCUSDT,ETHUSDT)';
const TIMEFRAME_EXPECTATION = 'timeframes separados por vírgula dentre 15m, 1h, 4h e 1d';

export const marketEnvironmentShape = {
  MARKET_EXCHANGE: z
    .enum(SUPPORTED_MARKET_EXCHANGES, { error: EXCHANGE_EXPECTATION })
    .default(DEFAULT_MARKET_EXCHANGE),
  MARKET_SYMBOLS: commaSeparatedTextSchema
    .pipe(
      z.array(z.string().regex(CONFIGURED_SYMBOL_PATTERN), { error: SYMBOL_EXPECTATION }).min(1),
    )
    .prefault(DEFAULT_MARKET_SYMBOLS),
  MARKET_TIMEFRAMES: commaSeparatedTextSchema
    .pipe(z.array(z.enum(TIMEFRAME), { error: TIMEFRAME_EXPECTATION }).min(1))
    .prefault(DEFAULT_MARKET_TIMEFRAMES),
};
