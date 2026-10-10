// Copyright (c) 2026 Ada Technology. All rights reserved.

// Canal do Postgres por onde o worker avisa a API: o aviso é só um ponteiro (`{ runId, kind, eventId }`), nunca o dado.
export const RUN_EVENTS_CHANNEL = 'run_events';
export const MAX_EVENT_ID_LENGTH = 64;

export const RUN_EVENT_KIND = {
  SIGNAL: 'signal',
  TRADE: 'trade',
  BALANCE: 'balance',
} as const;

export type RunEventKind = (typeof RUN_EVENT_KIND)[keyof typeof RUN_EVENT_KIND];
