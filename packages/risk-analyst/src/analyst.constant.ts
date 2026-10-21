// Copyright (c) 2026 Ada Technology. All rights reserved.
import { ENGINE_TIMEFRAME_DURATION_MILLISECONDS } from '@ativada/strategy-engine';

export const ANALYST_VERSION = 'analyst-1';

export const SPECIALIST_KEY = {
  TREND: 'trend',
  REVERSION: 'reversion',
  VOLUME: 'volume',
  SENTIMENT: 'sentiment',
} as const;
export type SpecialistKey = (typeof SPECIALIST_KEY)[keyof typeof SPECIALIST_KEY];
// A ordem da equipe é a da tela e a do dourado.
export const SPECIALIST_KEYS: readonly SpecialistKey[] = [
  SPECIALIST_KEY.TREND,
  SPECIALIST_KEY.REVERSION,
  SPECIALIST_KEY.VOLUME,
  SPECIALIST_KEY.SENTIMENT,
];

// O quinto item do auditor: a tendência da própria estratégia, que não vota nem pesa.
export const STRATEGY_AUDIT_KEY = 'strategy';
export type AuditedKey = SpecialistKey | typeof STRATEGY_AUDIT_KEY;
export const AUDITED_KEYS: readonly AuditedKey[] = [...SPECIALIST_KEYS, STRATEGY_AUDIT_KEY];

export const POSTURE = {
  PAUSE: 'pause',
  CAUTION: 'caution',
  NORMAL: 'normal',
  CONFIDENT: 'confident',
} as const;
export type Posture = (typeof POSTURE)[keyof typeof POSTURE];

export const LOCK_KEY = {
  DAILY_LOSS: 'daily_loss',
  LOSS_STREAK: 'loss_streak',
  TRADE_COUNT: 'trade_count',
  GOAL_ROOM: 'goal_room',
  MOVE_COST: 'move_cost',
} as const;
export type LockKey = (typeof LOCK_KEY)[keyof typeof LOCK_KEY];
// A ordem das travas é a da A10: a primeira ativa dá o motivo.
export const LOCK_KEYS: readonly LockKey[] = [
  LOCK_KEY.DAILY_LOSS,
  LOCK_KEY.LOSS_STREAK,
  LOCK_KEY.TRADE_COUNT,
  LOCK_KEY.GOAL_ROOM,
  LOCK_KEY.MOVE_COST,
];

export const NO_DATA_DETAIL = {
  WAITING_FOR_DATA: 'waiting_for_data',
  LATE_CANDLE: 'late_candle',
  MISSING_CANDLES: 'missing_candles',
  WARMING_UP: 'warming_up',
} as const;
export type NoDataDetail = (typeof NO_DATA_DETAIL)[keyof typeof NO_DATA_DETAIL];

export const NO_FORECAST_REASON = {
  NO_DATA: 'no_data',
  TOO_VOLATILE: 'too_volatile',
  NO_PROVEN_SPECIALIST: 'no_proven_specialist',
  PROVEN_NEUTRAL: 'proven_neutral',
  SPLIT_TEAM: 'split_team',
} as const;
export type NoForecastReason = (typeof NO_FORECAST_REASON)[keyof typeof NO_FORECAST_REASON];

export const FORECAST_SIDE = { UP: 'up', DOWN: 'down' } as const;
export type ForecastSide = (typeof FORECAST_SIDE)[keyof typeof FORECAST_SIDE];

export const FORECAST_STRENGTH = { WEAK: 'weak', FIRM: 'firm' } as const;
export type ForecastStrength = (typeof FORECAST_STRENGTH)[keyof typeof FORECAST_STRENGTH];

export const ANALYST_REASON = {
  NO_DATA: 'no_data',
  ...LOCK_KEY,
  QUIET_MARKET: 'quiet_market',
  TEAM_AGAINST: 'team_against',
  NO_FORECAST: 'no_forecast',
  WEAK_FORECAST: 'weak_forecast',
  FIRM_FORECAST: 'firm_forecast',
  FIRM_FORECAST_CAPPED: 'firm_forecast_capped',
} as const;
export type AnalystReason = (typeof ANALYST_REASON)[keyof typeof ANALYST_REASON];

export const CAPPED_DETAIL = {
  LOW_VOLUME: 'low_volume',
  HIGH_VOLATILITY: 'high_volatility',
} as const;
export type CappedDetail = (typeof CAPPED_DETAIL)[keyof typeof CAPPED_DETAIL];

export const ENTRY_GATE = { OPEN: 'open', CLOSED: 'closed' } as const;
export type EntryGate = (typeof ENTRY_GATE)[keyof typeof ENTRY_GATE];

export const ANALYST_COMMAND_KIND = {
  HALT: 'halt',
  RESUME: 'resume',
  EXIT_POSITION: 'exit_position',
} as const;
export type AnalystCommandKind = (typeof ANALYST_COMMAND_KIND)[keyof typeof ANALYST_COMMAND_KIND];

export const ANALYST_COMMAND_REASON = {
  PAUSE: 'analyst_pause',
  RESUME: 'analyst_resume',
  TIMEOUT: 'analyst_timeout',
} as const;
export type AnalystCommandReason =
  (typeof ANALYST_COMMAND_REASON)[keyof typeof ANALYST_COMMAND_REASON];

// Todos os números da regra `analyst-1` (A9). O mínimo de 30 contadas do auditor vem de `@ativada/statistics`.
export const ANALYST_RULES = {
  version: ANALYST_VERSION,
  baseTimeframe: '15m',
  auditWindowCandles: 2880,
  seriesLeadInCandles: 200,
  seriesAnchorMilliseconds: 86_400_000,
  weightBase: '0.5',
  volumeAverageCandles: 96,
  percentileWindowCandles: 2880,
  percentileMinimumSamples: 96,
  momentumShortCandles: 4,
  momentumLongCandles: 16,
  quietVolumeBelow: '0.4',
  fourHourCadenceVolumeBelow: '0.7',
  hourCadenceVolumeBelow: '1.5',
  cadenceMinutes: { fast: 15, hour: 60, fourHours: 240 },
  confidentMinimumVolume: '1',
  confidentMaximumAtrPercentile: 90,
  tooVolatileAtrPercentile: 95,
  teamShare: { numerator: 2, denominator: 3 },
  dailyLossRate: '0.01',
  lossWindowCandles: 96,
  lossStreakLimit: 3,
  lossStreakPauseCandles: 4,
  tradeCountLimit: 8,
  goalRoomTradeMultiple: '2',
  minimumMoveToCost: '2',
  maxTradeCandles: 4,
  riskScale: { pause: '0', caution: '0.25', normal: '0.5', confident: '1' },
  decimalPlaces: 12,
} as const;

export const CANDLE_MILLISECONDS =
  ENGINE_TIMEFRAME_DURATION_MILLISECONDS[ANALYST_RULES.baseTimeframe];
export const MILLISECONDS_PER_MINUTE = 60_000;
export const MAX_TRADE_MINUTES =
  (ANALYST_RULES.maxTradeCandles * CANDLE_MILLISECONDS) / MILLISECONDS_PER_MINUTE;
