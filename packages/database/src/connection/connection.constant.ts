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

export const DATABASE_CONNECTION_STATE = {
  UP: 'up',
  DOWN: 'down',
} as const;
export type DatabaseConnectionState =
  (typeof DATABASE_CONNECTION_STATE)[keyof typeof DATABASE_CONNECTION_STATE];

export const DATABASE_UNAVAILABLE_CODE = {
  UNAVAILABLE: 'DATABASE_UNAVAILABLE',
  QUERY_TIMEOUT: 'DATABASE_QUERY_TIMEOUT',
} as const;
export type DatabaseUnavailableCode =
  (typeof DATABASE_UNAVAILABLE_CODE)[keyof typeof DATABASE_UNAVAILABLE_CODE];

// Falhas de conexão SEGUIDAS (por código) que pedem um cliente novo; o teto de tempo pede na hora (ADR 0002, R5).
export const RECONNECT_FAILURE_THRESHOLD = 2;
export const DEFAULT_QUERY_TIMEOUT_SECONDS = 30;
export const CONNECTION_TIMEOUT_SECONDS = 10;
// Fecha o cliente aposentado sem esperar consulta pendurada (ADR 0002, R6).
export const RETIRED_CLIENT_CLOSE_TIMEOUT_SECONDS = 1;
export const MILLISECONDS_PER_SECOND = 1_000;
