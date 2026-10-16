// Copyright (c) 2026 Ada Technology. All rights reserved.
import { HTTP_STATUS } from '@ativada/environment';

import { ApiError } from './api.error.js';

export const RATE_LIMIT_MAX_ATTEMPTS = 5;
const BASE_DELAY_SECONDS = 2;
const MAX_DELAY_SECONDS = 30;
const MAX_RETRY_AFTER_SECONDS = 60;
const MILLISECONDS_PER_SECOND = 1_000;

export function isRateLimitError(error: unknown): error is ApiError {
  return error instanceof ApiError && error.status === HTTP_STATUS.TOO_MANY_REQUESTS;
}

// Espera crescente (2, 4, 8, 16 e 30 s no teto); o `Retry-After` do servidor, quando existe, manda (com teto de 60 s).
export function rateLimitDelaySeconds(
  failureCount: number,
  retryAfterSeconds: number | undefined,
): number {
  if (retryAfterSeconds !== undefined) return Math.min(retryAfterSeconds, MAX_RETRY_AFTER_SECONDS);
  return Math.min(BASE_DELAY_SECONDS * 2 ** Math.max(0, failureCount - 1), MAX_DELAY_SECONDS);
}

// O padrão das consultas: um 429 repete algumas vezes com espera crescente; qualquer outra falha repete uma vez.
export function shouldRetryQuery(failureCount: number, error: unknown): boolean {
  if (isRateLimitError(error)) return failureCount < RATE_LIMIT_MAX_ATTEMPTS;
  return failureCount < 1;
}

export function queryRetryDelay(failureCount: number, error: unknown): number {
  if (!isRateLimitError(error)) return MILLISECONDS_PER_SECOND;
  return rateLimitDelaySeconds(failureCount, error.retryAfterSeconds) * MILLISECONDS_PER_SECOND;
}
