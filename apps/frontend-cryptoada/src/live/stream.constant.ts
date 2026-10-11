// Copyright (c) 2026 Ada Technology. All rights reserved.
export const STREAM_STATUS = {
  CONNECTING: 'connecting',
  LIVE: 'live',
  RECONNECTING: 'reconnecting',
  STOPPED: 'stopped',
  BLOCKED: 'blocked',
} as const;

export type StreamStatus = (typeof STREAM_STATUS)[keyof typeof STREAM_STATUS];

// Códigos de fechamento da API (ADR 0001 §e): token vencido e conta bloqueada ou apagada.
export const CLOSE_CODE = {
  NORMAL: 1000,
  TOKEN_EXPIRED: 4401,
  ACCOUNT_BLOCKED: 4403,
  RENEWAL_FAILED: 4000,
} as const;

export const RESYNC_REASON_RECONNECTED = 'reconnected';
export const BASE_RECONNECT_MILLISECONDS = 1_000;
export const MAX_RECONNECT_MILLISECONDS = 30_000;
export const FIRST_RENEWAL_MILLISECONDS = 180_000;
export const RENEWAL_LEAD_MILLISECONDS = 60_000;
export const MIN_RENEWAL_MILLISECONDS = 30_000;
export const STREAM_PATH = '/v1/stream';
export const TICKET_PARAMETER = 'ticket';
