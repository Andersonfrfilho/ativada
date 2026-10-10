// Copyright (c) 2026 Ada Technology. All rights reserved.
export const TEMPORARY_DATABASE_PREFIX = 'crypto_goals_';
export const DAY_MILLISECONDS = 86_400_000;
export const EVALUATION_PAIRS = 'BTCUSDT,ETHUSDT,SOLUSDT,BNBUSDT,XRPUSDT';
export const EVALUATION_BUDGET_MILLISECONDS = 1_000;
export const SYNTHETIC_DAYS = 800;
export const SYNTHETIC_SEEDS: Readonly<Record<string, number>> = {
  BTCUSDT: 20_261_101,
  SOLUSDT: 20_261_102,
  BNBUSDT: 20_261_103,
  XRPUSDT: 20_261_104,
};
export const RESTART_HEARTBEAT_SECONDS = 1;
export const GOAL_SYMBOL = 'ETHUSDT';
export const GOAL_TIMEFRAME = '1d';
export const CHAT_BASE = 750_000_000;
export const GOAL_ALERT_SIDE = 'GOAL';
export const RUN_STATUS_COMPLETED = 'completed';
export const MISSING_GOAL_ID = '018f0000-0000-7000-8000-00000000dead';
