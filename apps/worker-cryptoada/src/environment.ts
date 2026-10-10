// Copyright (c) 2026 Ada Technology. All rights reserved.
import {
  checkProductionRules,
  environmentNameSchema,
  httpUrlSchema,
  nonEmptyTextSchema,
  parseEnvironment,
  postgresUrlSchema,
  webSocketUrlSchema,
  z,
  type ProductionProfile,
} from '@cryptoada/environment';
import {
  BINANCE_MARKET_DATA_BASE_URL,
  BINANCE_STREAM_BASE_URL,
  TIMEFRAME,
} from '@cryptoada/market-data';

import {
  DEFAULT_MARKET_EXCHANGE,
  DEFAULT_MARKET_SYMBOLS,
  DEFAULT_MARKET_TIMEFRAMES,
  DEFAULT_STREAM_GAP_CHECK_MINUTES,
  DEFAULT_STREAM_GAP_LOOKBACK_HOURS,
  DEFAULT_STREAM_STALE_SECONDS,
  MARKET_LIST_SEPARATOR,
  MAXIMUM_STREAM_GAP_CHECK_MINUTES,
  MAXIMUM_STREAM_GAP_LOOKBACK_HOURS,
  MAXIMUM_STREAM_STALE_SECONDS,
  MINIMUM_STREAM_GAP_CHECK_MINUTES,
  MINIMUM_STREAM_GAP_LOOKBACK_HOURS,
  MINIMUM_STREAM_STALE_SECONDS,
  SYMBOL_PATTERN,
} from './worker.constant.js';

const SYMBOL_EXPECTATION = 'símbolos em maiúsculas separados por vírgula (ex.: BTCUSDT,ETHUSDT)';
const TIMEFRAME_EXPECTATION = 'timeframes separados por vírgula dentre 15m, 1h, 4h e 1d';
const STALE_EXPECTATION = `inteiro de ${MINIMUM_STREAM_STALE_SECONDS} a ${MAXIMUM_STREAM_STALE_SECONDS}`;
const LOOKBACK_EXPECTATION = `inteiro de ${MINIMUM_STREAM_GAP_LOOKBACK_HOURS} a ${MAXIMUM_STREAM_GAP_LOOKBACK_HOURS}`;
const CHECK_EXPECTATION = `inteiro de ${MINIMUM_STREAM_GAP_CHECK_MINUTES} a ${MAXIMUM_STREAM_GAP_CHECK_MINUTES}`;

const PRODUCTION_PROFILE: ProductionProfile = {
  urlVariables: ['BINANCE_BASE_URL'],
  webSocketUrlVariables: ['BINANCE_STREAM_URL'],
  secretVariables: [],
  databaseUrlVariable: 'DATABASE_URL',
};

const commaSeparatedText = z
  .string()
  .transform((text) => text.split(MARKET_LIST_SEPARATOR).map((entry) => entry.trim()));

export const environmentSchema = z
  .object({
    ENV: environmentNameSchema,
    DATABASE_URL: postgresUrlSchema,
    MARKET_EXCHANGE: nonEmptyTextSchema.default(DEFAULT_MARKET_EXCHANGE),
    MARKET_SYMBOLS: commaSeparatedText
      .pipe(z.array(z.string().regex(SYMBOL_PATTERN), { error: SYMBOL_EXPECTATION }).min(1))
      .prefault(DEFAULT_MARKET_SYMBOLS),
    MARKET_TIMEFRAMES: commaSeparatedText
      .pipe(z.array(z.enum(TIMEFRAME), { error: TIMEFRAME_EXPECTATION }).min(1))
      .prefault(DEFAULT_MARKET_TIMEFRAMES),
    BINANCE_BASE_URL: httpUrlSchema.default(BINANCE_MARKET_DATA_BASE_URL),
    BINANCE_STREAM_URL: webSocketUrlSchema.default(BINANCE_STREAM_BASE_URL),
    STREAM_STALE_SECONDS: z.coerce
      .number({ error: STALE_EXPECTATION })
      .int({ error: STALE_EXPECTATION })
      .min(MINIMUM_STREAM_STALE_SECONDS, { error: STALE_EXPECTATION })
      .max(MAXIMUM_STREAM_STALE_SECONDS, { error: STALE_EXPECTATION })
      .default(DEFAULT_STREAM_STALE_SECONDS),
    STREAM_GAP_LOOKBACK_HOURS: z.coerce
      .number({ error: LOOKBACK_EXPECTATION })
      .int({ error: LOOKBACK_EXPECTATION })
      .min(MINIMUM_STREAM_GAP_LOOKBACK_HOURS, { error: LOOKBACK_EXPECTATION })
      .max(MAXIMUM_STREAM_GAP_LOOKBACK_HOURS, { error: LOOKBACK_EXPECTATION })
      .default(DEFAULT_STREAM_GAP_LOOKBACK_HOURS),
    STREAM_GAP_CHECK_MINUTES: z.coerce
      .number({ error: CHECK_EXPECTATION })
      .int({ error: CHECK_EXPECTATION })
      .min(MINIMUM_STREAM_GAP_CHECK_MINUTES, { error: CHECK_EXPECTATION })
      .max(MAXIMUM_STREAM_GAP_CHECK_MINUTES, { error: CHECK_EXPECTATION })
      .default(DEFAULT_STREAM_GAP_CHECK_MINUTES),
  })
  .superRefine((values, context) => checkProductionRules(values, PRODUCTION_PROFILE, context));

export type Environment = z.infer<typeof environmentSchema>;

export function loadEnvironment(): Environment {
  return parseEnvironment(environmentSchema, process.env);
}
