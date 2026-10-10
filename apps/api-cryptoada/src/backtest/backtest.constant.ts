// Copyright (c) 2026 Ada Technology. All rights reserved.

// Passos do motor por lote: cada lote é UMA transação com resultados e checkpoint (ADR 0002 §b).
export const BACKTEST_BATCH_SIZE = 2_000;
// Leitura de volta dos resultados para as métricas: páginas no teto do repositório.
export const RESULT_PAGE_SIZE = 5_000;
export const BACKTEST_MARKET_EXCHANGE = 'binance';
export const BACKTEST_PROGRESS_BEFORE_COMPLETION = 99;
export const PERCENT = 100;

// Códigos estáveis gravados em `runs.error_code` (até 64 caracteres) e nos eventos da thread.
export const BACKTEST_ERROR_CODE = {
  RUN_NOT_FOUND: 'RUN_NOT_FOUND',
  RUN_NOT_RUNNABLE: 'RUN_NOT_RUNNABLE',
  RUN_KIND_UNSUPPORTED: 'RUN_KIND_UNSUPPORTED',
  INVALID_RUN_DATA: 'INVALID_RUN_DATA',
  HASH_MISMATCH: 'HASH_MISMATCH',
  ENGINE_VERSION_MISMATCH: 'ENGINE_VERSION_MISMATCH',
  NO_CANDLES: 'NO_CANDLES',
  INSUFFICIENT_HISTORY: 'INSUFFICIENT_HISTORY',
  ENGINE_STATE_UNUSABLE: 'ENGINE_STATE_UNUSABLE',
  ENGINE_REJECTED_INPUT: 'ENGINE_REJECTED_INPUT',
  ENGINE_FAILED: 'ENGINE_FAILED',
  CHECKPOINT_REFUSED: 'CHECKPOINT_REFUSED',
  POSITION_UNTRACKED: 'POSITION_UNTRACKED',
  BACKTEST_TIMEOUT: 'BACKTEST_TIMEOUT',
  WORKER_CRASHED: 'WORKER_CRASHED',
  BACKTEST_INVALID_REQUEST: 'BACKTEST_INVALID_REQUEST',
  BACKTEST_UNEXPECTED: 'BACKTEST_UNEXPECTED',
} as const;
export type BacktestErrorCode = (typeof BACKTEST_ERROR_CODE)[keyof typeof BACKTEST_ERROR_CODE];

export const BACKTEST_OUTCOME_STATUS = {
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
  FAILED: 'failed',
} as const;

export const BACKTEST_PHASE = {
  LOAD: 'load',
  ENGINE: 'engine',
  WRITE: 'write',
  METRICS: 'metrics',
} as const;
export type BacktestPhase = (typeof BACKTEST_PHASE)[keyof typeof BACKTEST_PHASE];

export const POSITION_STATUS = { OPEN: 'open', CLOSED: 'closed' } as const;
