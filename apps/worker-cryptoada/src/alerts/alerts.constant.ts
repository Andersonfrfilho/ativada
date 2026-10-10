// Copyright (c) 2026 Ada Technology. All rights reserved.
export const DEFAULT_TELEGRAM_API_BASE_URL = 'https://api.telegram.org';

export const ALERT_DEFAULT_POLL_SECONDS = 2;
export const ALERT_MINIMUM_POLL_SECONDS = 1;
export const ALERT_MAXIMUM_POLL_SECONDS = 60;

// O arrendamento tem de passar do pior caso de um lote inteiro (lote × prazo de cada envio): vencido no meio, outro
// despachante reenviaria o que o primeiro já mandou.
export const ALERT_BATCH_SIZE = 10;
export const ALERT_REQUEST_TIMEOUT_MILLISECONDS = 8_000;
export const ALERT_LEASE_MILLISECONDS = 120_000;

export const ALERT_MAX_ATTEMPTS = 5;
export const ALERT_BACKOFF_BASE_MILLISECONDS = 30_000;
export const ALERT_RETRY_AFTER_CAP_MILLISECONDS = 900_000;
export const MILLISECONDS_PER_SECOND = 1_000;

export const TELEGRAM_MESSAGE_MAX_LENGTH = 4_096;

// Códigos curtos gravados em `alerts.last_error`: nunca texto de erro, URL, token nem chat.
export const ALERT_ERROR_CODE = {
  NO_LINK: 'no_link',
  BAD_PAYLOAD: 'bad_payload',
  NETWORK: 'network',
  BAD_RESPONSE: 'bad_response',
  RATE_LIMITED: 'http_429',
  SERVER_ERROR: 'http_5xx',
} as const;

export const ALERT_LOG = {
  SENT: 'alert sent',
  RETRY_SCHEDULED: 'alert delivery will be retried',
  GAVE_UP: 'alert delivery failed',
  SKIPPED: 'alert skipped',
  DELIVERY_ERROR: 'alert delivery errored',
  DISPATCH_FAILED: 'alert dispatch failed',
} as const;
