// Copyright (c) 2026 Ada Technology. All rights reserved.

// Canal do Postgres por onde o worker avisa a API: o aviso é só um ponteiro (`{ runId, kind, eventId }`), nunca o dado.
export const RUN_EVENTS_CHANNEL = 'run_events';
export const MAX_EVENT_ID_LENGTH = 64;

export const RUN_EVENT_KIND = {
  SIGNAL: 'signal',
  TRADE: 'trade',
  BALANCE: 'balance',
  // A simulação parou à espera de candles que faltam (`waitingForData` na execução).
  WARNING: 'warning',
  // O analista de risco decidiu a vela (spec 007): `eventId` é a abertura da vela decidida.
  ANALYST: 'analyst',
} as const;

export type RunEventKind = (typeof RUN_EVENT_KIND)[keyof typeof RUN_EVENT_KIND];

// O aviso do disparo de um alerta de preço (T4b.7) usa o mesmo canal: `{ kind, alertId }`, só o ponteiro; a API resolve o dono
// pelo banco.
export const PRICE_ALERT_EVENT_KIND = 'price_alert';
