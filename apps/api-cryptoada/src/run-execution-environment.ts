// Copyright (c) 2026 Ada Technology. All rights reserved.
import { marketEnvironmentShape } from '@cryptoada/market-data';
import { z } from '@cryptoada/environment';

const BACKTEST_TIMEOUT_EXPECTATION = 'inteiro de segundos entre 5 e 86400';
const MIN_BACKTEST_TIMEOUT_SECONDS = 5;
const MAX_BACKTEST_TIMEOUT_SECONDS = 86_400;
const DEFAULT_BACKTEST_TIMEOUT_SECONDS = 900;
const WALK_FORWARD_TIMEOUT_EXPECTATION = 'inteiro de segundos entre 5 e 86400';
const DEFAULT_WALK_FORWARD_TIMEOUT_SECONDS = 3_600;
const WALK_FORWARD_THREADS_EXPECTATION = 'inteiro entre 1 e 8';
const MIN_WALK_FORWARD_THREADS = 1;
const MAX_WALK_FORWARD_THREADS = 8;
const DEFAULT_WALK_FORWARD_THREADS = 2;

// Quantas threads de busca o walk-forward usa (RNF02): o resultado não depende do número.
export const walkForwardThreadsSchema = z.coerce
  .number({ error: WALK_FORWARD_THREADS_EXPECTATION })
  .int({ error: WALK_FORWARD_THREADS_EXPECTATION })
  .min(MIN_WALK_FORWARD_THREADS, { error: WALK_FORWARD_THREADS_EXPECTATION })
  .max(MAX_WALK_FORWARD_THREADS, { error: WALK_FORWARD_THREADS_EXPECTATION })
  .default(DEFAULT_WALK_FORWARD_THREADS);

// Tempo e paralelismo das threads de execução e o mercado habilitado (os mesmos do cron e do worker).
export const runExecutionEnvironmentShape = {
  BACKTEST_TIMEOUT_SECONDS: z.coerce
    .number({ error: BACKTEST_TIMEOUT_EXPECTATION })
    .int({ error: BACKTEST_TIMEOUT_EXPECTATION })
    .min(MIN_BACKTEST_TIMEOUT_SECONDS, { error: BACKTEST_TIMEOUT_EXPECTATION })
    .max(MAX_BACKTEST_TIMEOUT_SECONDS, { error: BACKTEST_TIMEOUT_EXPECTATION })
    .default(DEFAULT_BACKTEST_TIMEOUT_SECONDS),
  WALK_FORWARD_THREADS: walkForwardThreadsSchema,
  WALK_FORWARD_TIMEOUT_SECONDS: z.coerce
    .number({ error: WALK_FORWARD_TIMEOUT_EXPECTATION })
    .int({ error: WALK_FORWARD_TIMEOUT_EXPECTATION })
    .min(MIN_BACKTEST_TIMEOUT_SECONDS, { error: WALK_FORWARD_TIMEOUT_EXPECTATION })
    .max(MAX_BACKTEST_TIMEOUT_SECONDS, { error: WALK_FORWARD_TIMEOUT_EXPECTATION })
    .default(DEFAULT_WALK_FORWARD_TIMEOUT_SECONDS),
  // Pares e timeframes habilitados no ambiente (os mesmos do cron e do worker): a consulta de candles e a criação
  // de execuções só aceitam estes.
  MARKET_EXCHANGE: marketEnvironmentShape.MARKET_EXCHANGE,
  MARKET_SYMBOLS: marketEnvironmentShape.MARKET_SYMBOLS,
  MARKET_TIMEFRAMES: marketEnvironmentShape.MARKET_TIMEFRAMES,
} as const;
