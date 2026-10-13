// Copyright (c) 2026 Ada Technology. All rights reserved.
export const RECONNECT_BASE_MILLISECONDS = 1_000;
export const RECONNECT_MAX_MILLISECONDS = 30_000;

// Um resumo por esta janela durante a queda; a primeira falha e a volta sempre saem.
export const OUTAGE_LOG_INTERVAL_MILLISECONDS = 60_000;

export const OUTAGE_LOG_MESSAGE = {
  UNAVAILABLE: 'database unavailable',
  RECOVERED: 'database recovered',
} as const;

export const OUTAGE_LOG_LEVEL = {
  ERROR: 'error',
  INFO: 'info',
} as const;

// Erro de driver encadeado por `cause` (DrizzleQueryError -> PostgresError): não se lê mais fundo que isto.
export const MAX_ERROR_CAUSE_DEPTH = 4;
export const UNKNOWN_ERROR_NAME = 'UnknownError';
export const UNKNOWN_ERROR_CODE = 'UNKNOWN';
