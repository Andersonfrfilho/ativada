// Copyright (c) 2026 Ada Technology. All rights reserved.
import {
  MILLISECONDS_PER_SECOND,
  MINIMUM_STATEMENT_TIMEOUT_SECONDS,
  STATEMENT_TIMEOUT_MARGIN_SECONDS,
} from './connection.constant.js';

// O servidor aborta a consulta lenta alguns segundos ANTES do teto do cliente: só uma conexão que não responde chega ao timer.
export function computeStatementTimeoutMilliseconds(queryTimeoutSeconds: number): number {
  const seconds = Math.max(
    MINIMUM_STATEMENT_TIMEOUT_SECONDS,
    queryTimeoutSeconds - STATEMENT_TIMEOUT_MARGIN_SECONDS,
  );
  return seconds * MILLISECONDS_PER_SECOND;
}
