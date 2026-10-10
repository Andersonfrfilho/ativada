// Copyright (c) 2026 Ada Technology. All rights reserved.
// Vocabulário gravado pelo motor (ADR 0002 §g); o pacote não importa o strategy-engine, então repete os valores.
export const SIGNAL_ACTION = { BUY: 'BUY', SELL: 'SELL', HOLD: 'HOLD' } as const;
export type SignalAction = (typeof SIGNAL_ACTION)[keyof typeof SIGNAL_ACTION];

export const REGIME = { TRENDING: 'trending', RANGING: 'ranging', NONE: 'none' } as const;
export type Regime = (typeof REGIME)[keyof typeof REGIME];

export const ORDER_SIDE = { BUY: 'buy', SELL: 'sell' } as const;
export type OrderSide = (typeof ORDER_SIDE)[keyof typeof ORDER_SIDE];

export const ORDER_TYPE = {
  MARKET: 'market',
  LIMIT: 'limit',
  STOP: 'stop',
  TARGET: 'target',
} as const;
export type OrderType = (typeof ORDER_TYPE)[keyof typeof ORDER_TYPE];

export const ORDER_PURPOSE = { ENTRY: 'entry', EXIT: 'exit' } as const;
export type OrderPurpose = (typeof ORDER_PURPOSE)[keyof typeof ORDER_PURPOSE];

export const ORDER_STATUS = {
  CREATED: 'created',
  FILLED: 'filled',
  CANCELLED: 'cancelled',
  EXPIRED: 'expired',
  REJECTED: 'rejected',
} as const;
export type OrderStatus = (typeof ORDER_STATUS)[keyof typeof ORDER_STATUS];

export const EXIT_REASON = {
  STOP: 'stop',
  TARGET: 'target',
  SIGNAL: 'signal',
  COMMAND: 'command',
  GAP: 'gap',
} as const;
export type ExitReason = (typeof EXIT_REASON)[keyof typeof EXIT_REASON];

export const ORDER_REASON = {
  BELOW_MIN_NOTIONAL: 'below_min_notional',
  ZERO_ATR: 'zero_atr',
  INVALID_STOP: 'invalid_stop',
  OPPOSITE_SIGNAL: 'opposite_signal',
  COMMAND: 'command',
  GAP: 'gap',
  VOLUME_CAPPED: 'volume_capped',
} as const;
export type OrderReason = (typeof ORDER_REASON)[keyof typeof ORDER_REASON];

export const POSITION_STATUS = { OPEN: 'open', CLOSED: 'closed' } as const;
export type PositionStatus = (typeof POSITION_STATUS)[keyof typeof POSITION_STATUS];

export const COMMAND_KIND = {
  EXIT_POSITION: 'exit_position',
  HALT: 'halt',
  RESUME: 'resume',
} as const;
export type CommandKind = (typeof COMMAND_KIND)[keyof typeof COMMAND_KIND];

export const COMMAND_REASON = {
  GOAL_REACHED: 'goal_reached',
  GOAL_MAX_LOSS: 'goal_max_loss',
  GOAL_EXPIRED: 'goal_expired',
  USER_STOP: 'user_stop',
  KILL_SWITCH: 'kill_switch',
  WINDOW_END: 'window_end',
  USER_RESUME: 'user_resume',
} as const;
export type CommandReason = (typeof COMMAND_REASON)[keyof typeof COMMAND_REASON];

export const COMMAND_STATUS = {
  APPLIED: 'applied',
  IGNORED_DUPLICATE: 'ignored_duplicate',
} as const;
export type CommandStatus = (typeof COMMAND_STATUS)[keyof typeof COMMAND_STATUS];

// Linhas por INSERT (ADR 0002 §b) e teto de parâmetros do protocolo do Postgres (65.535) com folga.
export const RESULT_INSERT_MAXIMUM_ROWS = 5_000;
export const RESULT_INSERT_MAXIMUM_PARAMETERS = 60_000;
export const RESULT_PAGE_MAXIMUM_SIZE = 5_000;
export const ENGINE_KEY_MAX_LENGTH = 64;
export const COMMAND_ID_MAX_LENGTH = 64;

export const WALK_FORWARD_WINDOW_STATUS = {
  OK: 'ok',
  NO_ELIGIBLE_PARAMETERS: 'no_eligible_parameters',
} as const;
export type WalkForwardWindowStatus =
  (typeof WALK_FORWARD_WINDOW_STATUS)[keyof typeof WALK_FORWARD_WINDOW_STATUS];
