// Copyright (c) 2026 Ada Technology. All rights reserved.

// No máximo estes passos por execução em cada ronda: o batimento é renovado entre uma ronda e outra.
export const LIVE_MAX_STEPS_PER_PASS = 500;
export const LIVE_DEFAULT_POLL_SECONDS = 5;
export const LIVE_MINIMUM_POLL_SECONDS = 1;
export const LIVE_MAXIMUM_POLL_SECONDS = 300;
export const LIVE_DEFAULT_HEARTBEAT_TIMEOUT_SECONDS = 60;
export const LIVE_MINIMUM_HEARTBEAT_TIMEOUT_SECONDS = 5;
export const LIVE_MAXIMUM_HEARTBEAT_TIMEOUT_SECONDS = 3_600;
// O ao vivo não tem fim: o progresso fica em zero e o painel mostra o último candle.
export const LIVE_PROGRESS = 0;

export const LIVE_ERROR_CODE = {
  RUN_KIND_UNSUPPORTED: 'RUN_KIND_UNSUPPORTED',
  INVALID_RUN_DATA: 'INVALID_RUN_DATA',
  HASH_MISMATCH: 'HASH_MISMATCH',
  ENGINE_VERSION_MISMATCH: 'ENGINE_VERSION_MISMATCH',
  INSUFFICIENT_HISTORY: 'INSUFFICIENT_HISTORY',
  ENGINE_STATE_UNUSABLE: 'ENGINE_STATE_UNUSABLE',
  ENGINE_REJECTED_INPUT: 'ENGINE_REJECTED_INPUT',
  ENGINE_FAILED: 'ENGINE_FAILED',
  LIVE_UNEXPECTED: 'LIVE_UNEXPECTED',
} as const;
export type LiveErrorCode = (typeof LIVE_ERROR_CODE)[keyof typeof LIVE_ERROR_CODE];

// Como uma ronda de uma execução termina: `idle` (nada novo), `advanced` (processou candles), `waiting` (um buraco ainda
// pode ser preenchido pela recuperação), `ended` (cancelada, apagada, conta inativa) ou `failed` (falha tipada gravada).
export const LIVE_PASS_KIND = {
  IDLE: 'idle',
  ADVANCED: 'advanced',
  WAITING: 'waiting',
  ENDED: 'ended',
  FAILED: 'failed',
} as const;

export const LIVE_COMMIT_OUTCOME = {
  COMMITTED: 'committed',
  STOPPED: 'stopped',
  VANISHED: 'vanished',
  ALREADY_RECORDED: 'already_recorded',
} as const;

export const LIVE_LOG = {
  RUN_CLAIMED: 'live run claimed',
  RUN_TAKEN_OVER: 'live run taken over from a stopped worker',
  RUN_LOST: 'live run lost to another worker',
  RUN_ENDED: 'live run ended',
  RUN_FAILED: 'live run failed',
  RUN_WAITING_FOR_GAP: 'live run waiting for a candle gap to be recovered',
  RUN_RETRY: 'live run will be retried',
  TICK_FAILED: 'live tick failed',
  RELEASED: 'live runs released on shutdown',
} as const;
