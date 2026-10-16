// Copyright (c) 2026 Ada Technology. All rights reserved.
export const NOTICES_PATH = '/v1/notices';

export const NOTICE_QUERY_KEY = 'notices';
export const NOTICE_SCOPE = { RUNS: 'runs', PRICE_ALERTS: 'price-alerts' } as const;

export const NOTICE_KIND = {
  ENTRY: 'entry',
  EXIT: 'exit',
  RUN: 'run',
  GOAL: 'goal',
  PRICE_ALERT: 'price_alert',
} as const;
export type NoticeKind = (typeof NOTICE_KIND)[keyof typeof NOTICE_KIND];

export const NOTICE_STATE = {
  CREATED: 'created',
  FILLED: 'filled',
  CANCELLED: 'cancelled',
  EXPIRED: 'expired',
  REJECTED: 'rejected',
  DONE: 'done',
} as const;
export type NoticeState = (typeof NOTICE_STATE)[keyof typeof NOTICE_STATE];

export const NOTICE_LIST_LIMIT = 50;
export const PRICE_ALERT_LIST_LIMIT = 20;

export const TOAST_VISIBLE_MAXIMUM = 3;
export const TOAST_LIFETIME_MILLISECONDS = 8_000;
export const SUMMARY_AWAY_MILLISECONDS = 60_000;
export const CONNECTION_STRIP_MILLISECONDS = 5_000;
export const JUST_NOW_MILLISECONDS = 60_000;

export const NOTICE_STORAGE_PREFIX = 'ativada.notices.';
export const ANONYMOUS_SUBJECT = 'anonymous';

export const SIMULATION_FIXED_TEXT = 'Simulações com dinheiro fictício. Não é recomendação.';
export const TREND_NOT_PROMISE = 'Tendência, não promessa.';

export const TIME_TOKEN = {
  OPENS: '{abre}',
  CLOSES: '{fecha}',
  EXPIRES: '{validade}',
  AT: '{hora}',
} as const;
