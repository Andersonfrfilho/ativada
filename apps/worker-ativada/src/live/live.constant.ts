// Copyright (c) 2026 Ada Technology. All rights reserved.

// No máximo estes passos por execução em cada ronda: o batimento é renovado entre uma ronda e outra.
export const LIVE_MAX_STEPS_PER_PASS = 500;
export const LIVE_DEFAULT_POLL_SECONDS = 5;
export const LIVE_MINIMUM_POLL_SECONDS = 1;
export const LIVE_MAXIMUM_POLL_SECONDS = 300;
export const LIVE_DEFAULT_HEARTBEAT_TIMEOUT_SECONDS = 60;
export const LIVE_MINIMUM_HEARTBEAT_TIMEOUT_SECONDS = 5;
export const LIVE_MAXIMUM_HEARTBEAT_TIMEOUT_SECONDS = 3_600;
// Quantas recuperações de lacunas SEM erro precisam deixar um buraco como estava para a Binance valer como "não tem o candle".
export const LIVE_DEFAULT_GAP_CONFIRM_RECOVERIES = 3;
export const LIVE_MINIMUM_GAP_CONFIRM_RECOVERIES = 1;
export const LIVE_MAXIMUM_GAP_CONFIRM_RECOVERIES = 50;
// Um candle recém-fechado pode demorar a aparecer no REST: antes desta idade nenhuma contagem confirma o buraco.
export const LIVE_GAP_MINIMUM_AGE_MILLISECONDS = 600_000;
// Alerta de sinal só de candle fechado há no máximo isto: replay depois de parada longa não vira notícia velha.
export const LIVE_ALERT_MAX_AGE_CANDLES = 2;
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
// pode ser preenchido pela recuperação), `awaiting_team` (a decisão da equipe ainda vem), `ended` (cancelada, apagada, conta inativa) ou `failed` (falha tipada gravada).
export const LIVE_PASS_KIND = {
  IDLE: 'idle',
  ADVANCED: 'advanced',
  WAITING: 'waiting',
  AWAITING_TEAM: 'awaiting_team',
  ENDED: 'ended',
  FAILED: 'failed',
} as const;

export const LIVE_COMMIT_OUTCOME = {
  COMMITTED: 'committed',
  STOPPED: 'stopped',
  VANISHED: 'vanished',
  ALREADY_RECORDED: 'already_recorded',
  // A decisão gravada da equipe ainda não chegou e o prazo não passou: o passo devolve SEM commit e a ronda seguinte tenta de novo.
  AWAITING_TEAM: 'awaiting_team',
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
  RELEASE_FAILED: 'live release failed',
} as const;
