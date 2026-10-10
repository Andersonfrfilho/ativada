// Copyright (c) 2026 Ada Technology. All rights reserved.

export const SIGNAL_ACTION = { BUY: 'BUY', SELL: 'SELL', HOLD: 'HOLD' } as const;
export type SignalAction = (typeof SIGNAL_ACTION)[keyof typeof SIGNAL_ACTION];

export const STRATEGY_FAMILY = {
  TREND: 'trend',
  REVERSION: 'reversion',
  VOLUME: 'volume',
  SENTIMENT: 'sentiment',
} as const;
export type StrategyFamily = (typeof STRATEGY_FAMILY)[keyof typeof STRATEGY_FAMILY];

export const REGIME = { TRENDING: 'trending', RANGING: 'ranging', NONE: 'none' } as const;
export type Regime = (typeof REGIME)[keyof typeof REGIME];

export const RULE_KIND = {
  EMA_CROSS: 'ema_cross',
  MACD: 'macd',
  DONCHIAN_BREAKOUT: 'donchian_breakout',
  RSI: 'rsi',
  BOLLINGER: 'bollinger',
  OBV_TREND: 'obv_trend',
  FEAR_GREED: 'fear_greed',
} as const;
export type RuleKind = (typeof RULE_KIND)[keyof typeof RULE_KIND];

// A família é da regra, não da configuração: o peso por regime é que muda.
export const RULE_FAMILY: Readonly<Record<RuleKind, StrategyFamily>> = {
  [RULE_KIND.EMA_CROSS]: STRATEGY_FAMILY.TREND,
  [RULE_KIND.MACD]: STRATEGY_FAMILY.TREND,
  [RULE_KIND.DONCHIAN_BREAKOUT]: STRATEGY_FAMILY.TREND,
  [RULE_KIND.RSI]: STRATEGY_FAMILY.REVERSION,
  [RULE_KIND.BOLLINGER]: STRATEGY_FAMILY.REVERSION,
  [RULE_KIND.OBV_TREND]: STRATEGY_FAMILY.VOLUME,
  [RULE_KIND.FEAR_GREED]: STRATEGY_FAMILY.SENTIMENT,
};

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
  STOP: ORDER_TYPE.STOP,
  TARGET: ORDER_TYPE.TARGET,
  SIGNAL: 'signal',
  COMMAND: 'command',
  // Lacuna confirmada: o stop é assumido tocado e a posição sai na abertura seguinte à lacuna (ADR 0002 §e).
  GAP: 'gap',
} as const;
export type ExitReason = (typeof EXIT_REASON)[keyof typeof EXIT_REASON];

export const ORDER_EVENT_REASON = {
  BELOW_MIN_NOTIONAL: 'below_min_notional',
  ZERO_ATR: 'zero_atr',
  INVALID_STOP: 'invalid_stop',
  OPPOSITE_SIGNAL: 'opposite_signal',
  COMMAND: EXIT_REASON.COMMAND,
  // Ordem pendente que caducou numa lacuna confirmada, ou a saída que a lacuna provocou.
  GAP: EXIT_REASON.GAP,
  // Preenchimento reduzido à participação máxima no volume do candle (a ordem continua `filled`).
  VOLUME_CAPPED: 'volume_capped',
} as const;
export type OrderEventReason = (typeof ORDER_EVENT_REASON)[keyof typeof ORDER_EVENT_REASON];

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

export const ENTRY_ORDER_TYPE = { MARKET: ORDER_TYPE.MARKET, LIMIT: ORDER_TYPE.LIMIT } as const;
export type EntryOrderType = (typeof ENTRY_ORDER_TYPE)[keyof typeof ENTRY_ORDER_TYPE];

export const REGIME_FILTER_KIND = { NONE: REGIME.NONE, ADX: 'adx' } as const;
export type RegimeFilterKind = (typeof REGIME_FILTER_KIND)[keyof typeof REGIME_FILTER_KIND];

// Fatos da corretora (spec 002) que entram no passo como dado: o passo continua puro.
export const EXECUTION_REPORT_KIND = {
  FILL: 'fill',
  ORDER_REJECTED: 'order_rejected',
  POSITION_CLOSED_EXTERNALLY: 'position_closed_externally',
} as const;
export type ExecutionReportKind =
  (typeof EXECUTION_REPORT_KIND)[keyof typeof EXECUTION_REPORT_KIND];
