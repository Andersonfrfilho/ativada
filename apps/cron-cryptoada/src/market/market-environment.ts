// Copyright (c) 2026 Ada Technology. All rights reserved.
import { httpUrlSchema, nonEmptyTextSchema, z } from '@cryptoada/environment';
import { TIMEFRAME } from '@cryptoada/market-data';

import { TASK_NAME } from '../cron.constant.js';
import {
  DEFAULT_BACKFILL_YEARS,
  DEFAULT_MARKET_EXCHANGE,
  DEFAULT_MARKET_SYMBOLS,
  DEFAULT_MARKET_TIMEFRAMES,
  MARKET_LIST_SEPARATOR,
  MAXIMUM_BACKFILL_YEARS,
  MINIMUM_BACKFILL_YEARS,
  SYMBOL_PATTERN,
} from './market.constant.js';

const DEFAULT_BINANCE_BASE_URL = 'https://data-api.binance.vision';
const SYMBOL_EXPECTATION = 'símbolos em maiúsculas separados por vírgula (ex.: BTCUSDT,ETHUSDT)';
const TIMEFRAME_EXPECTATION = 'timeframes separados por vírgula dentre 15m, 1h, 4h e 1d';
const YEARS_EXPECTATION = `inteiro de ${MINIMUM_BACKFILL_YEARS} a ${MAXIMUM_BACKFILL_YEARS}`;
const TASKS_EXPECTATION = 'nomes de tarefas do cron separados por vírgula';

const commaSeparatedText = z
  .string()
  .transform((text) => text.split(MARKET_LIST_SEPARATOR).map((entry) => entry.trim()));

export const marketEnvironmentShape = {
  MARKET_EXCHANGE: nonEmptyTextSchema.default(DEFAULT_MARKET_EXCHANGE),
  MARKET_SYMBOLS: commaSeparatedText
    .pipe(z.array(z.string().regex(SYMBOL_PATTERN), { error: SYMBOL_EXPECTATION }).min(1))
    .prefault(DEFAULT_MARKET_SYMBOLS),
  MARKET_TIMEFRAMES: commaSeparatedText
    .pipe(z.array(z.enum(TIMEFRAME), { error: TIMEFRAME_EXPECTATION }).min(1))
    .prefault(DEFAULT_MARKET_TIMEFRAMES),
  BACKFILL_YEARS: z.coerce
    .number({ error: YEARS_EXPECTATION })
    .int({ error: YEARS_EXPECTATION })
    .min(MINIMUM_BACKFILL_YEARS, { error: YEARS_EXPECTATION })
    .max(MAXIMUM_BACKFILL_YEARS, { error: YEARS_EXPECTATION })
    .default(DEFAULT_BACKFILL_YEARS),
  BINANCE_BASE_URL: httpUrlSchema.default(DEFAULT_BINANCE_BASE_URL),
  CRON_TASKS: commaSeparatedText
    .pipe(z.array(z.enum(TASK_NAME), { error: TASKS_EXPECTATION }).min(1))
    .optional(),
};
