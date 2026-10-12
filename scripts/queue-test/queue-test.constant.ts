// Copyright (c) 2026 Ada Technology. All rights reserved.
export const TEMPORARY_DATABASE_PREFIX = 'ativada_queue_';
export const SYMBOL = 'BTCUSDT';
export const HOUR_MILLISECONDS = 3_600_000;
export const DAY_MILLISECONDS = 86_400_000;
// Backtest LEVE: poucos candles depois do aquecimento, para que dezenas deles caibam no tempo do teste.
export const LIGHT_BACKTEST_CANDLES = 300;
export const WARM_UP_DAYS = 300;
export const DAILY_CANDLES = WARM_UP_DAYS + 430;
export const DAILY_SEED = 20_261_017;
export const SAMPLE_PAUSE_MILLISECONDS = 25;
export const WAIT_TIMEOUT_MILLISECONDS = 240_000;
export const HEARTBEAT_INTERVAL_MILLISECONDS = 250;
export const HEARTBEAT_TIMEOUT_SECONDS = 3;
export const POLL_INTERVAL_MILLISECONDS = 150;
export const SUBJECT_PREFIX = 'subject-queue';
