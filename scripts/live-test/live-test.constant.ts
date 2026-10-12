// Copyright (c) 2026 Ada Technology. All rights reserved.
export const TEMPORARY_DATABASE_PREFIX = 'ativada_live_';
export const EXCHANGE = 'binance';
export const HOUR_MILLISECONDS = 3_600_000;
// Batimento curto: a instância que morre deixa de bater e a outra a assume em poucos segundos.
export const HEARTBEAT_TIMEOUT_SECONDS = 2;
export const TICK_PAUSE_MILLISECONDS = 25;
export const WAIT_TIMEOUT_MILLISECONDS = 120_000;
export const QUIET_TICKS = 2;
export const CHILD_SCRIPT = new URL('./live-child.ts', import.meta.url).pathname;
export const CHILD_INSTANCE_VARIABLE = 'LIVE_CHILD_INSTANCE';
export const CHILD_KILL_VARIABLE = 'LIVE_CHILD_KILL_AFTER_COMMITS';
export const SUBJECT_PREFIX = 'subject-live';
