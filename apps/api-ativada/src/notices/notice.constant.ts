// Copyright (c) 2026 Ada Technology. All rights reserved.
export const NOTICES_PATH = '/v1/notices';

export const NOTICE_PAGE_SIZE = { DEFAULT: 30, MAXIMUM: 50 } as const;

// Quanto da história o feed enxerga: aviso mais velho que isso não aparece (o painel mostra os de hoje e de ontem).
export const NOTICE_WINDOW_MILLISECONDS = 30 * 24 * 60 * 60 * 1000;

export const NOTICE_KIND = {
  ENTRY: 'entry',
  EXIT: 'exit',
  RUN: 'run',
  GOAL: 'goal',
  PRICE_ALERT: 'price_alert',
} as const;
export type NoticeKind = (typeof NOTICE_KIND)[keyof typeof NOTICE_KIND];

// O ciclo da ordem é UM aviso que muda de estado (D1-A); os demais avisos nascem prontos (`done`).
export const NOTICE_STATE = {
  CREATED: 'created',
  FILLED: 'filled',
  CANCELLED: 'cancelled',
  EXPIRED: 'expired',
  REJECTED: 'rejected',
  DONE: 'done',
} as const;
export type NoticeState = (typeof NOTICE_STATE)[keyof typeof NOTICE_STATE];

export const NOTICE_SCOPE_QUERY = ['runs', 'price-alerts', 'all'] as const;
