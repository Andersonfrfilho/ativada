// Copyright (c) 2026 Ada Technology. All rights reserved.
export const RUN_KIND = {
  BACKTEST: 'backtest',
  WALK_FORWARD: 'walk_forward',
  LIVE_PAPER: 'live_paper',
} as const;
export type RunKind = (typeof RUN_KIND)[keyof typeof RUN_KIND];

export const RUN_STATUS = {
  QUEUED: 'queued',
  RUNNING: 'running',
  COMPLETED: 'completed',
  FAILED: 'failed',
  CANCELLED: 'cancelled',
} as const;
export type RunStatus = (typeof RUN_STATUS)[keyof typeof RUN_STATUS];

export const RUN_TRANSITION_OUTCOME = {
  TRANSITIONED: 'transitioned',
  NOT_FOUND: 'not_found',
  INVALID_TRANSITION: 'invalid_transition',
} as const;

export const TERMINAL_RUN_STATUSES: readonly RunStatus[] = [
  RUN_STATUS.COMPLETED,
  RUN_STATUS.FAILED,
  RUN_STATUS.CANCELLED,
];

// Estado de partida aceito por destino: a execução só anda para a frente e o estado final não muda.
export const RUN_TRANSITION_SOURCES: Readonly<Record<RunStatus, readonly RunStatus[]>> = {
  [RUN_STATUS.QUEUED]: [],
  [RUN_STATUS.RUNNING]: [RUN_STATUS.QUEUED],
  [RUN_STATUS.COMPLETED]: [RUN_STATUS.RUNNING],
  [RUN_STATUS.FAILED]: [RUN_STATUS.QUEUED, RUN_STATUS.RUNNING],
  [RUN_STATUS.CANCELLED]: [RUN_STATUS.QUEUED, RUN_STATUS.RUNNING],
};

export const RUN_PAGE_MAXIMUM_SIZE = 100;
export const RUN_PROGRESS_MAXIMUM = 100;
export const RUN_HASH_LENGTH = 64;
export const RUN_TIMEFRAMES: readonly string[] = ['15m', '1h', '4h', '1d'];
