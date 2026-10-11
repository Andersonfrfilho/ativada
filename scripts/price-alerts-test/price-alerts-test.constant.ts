// Copyright (c) 2026 Ada Technology. All rights reserved.
export const TEMPORARY_DATABASE_PREFIX = 'crypto_price_alerts_it_';
export const SUBJECT_PREFIX = 'subject-price-alerts-test';
export const SYMBOL = 'BTCUSDT';
export const OTHER_SYMBOL = 'ETHUSDT';
export const CHAT_OF_A = '750000001';
export const CHAT_OF_B = '750000002';
export const SECOND = 1_000;
export const STALE_SECONDS = 10;
export const STALE_MILLISECONDS = STALE_SECONDS * SECOND;
export const MAX_ENABLED = 50;
// O relógio do despachante parte de uma hora à frente do relógio do banco: tudo o que já foi enfileirado está vencido.
export const CLOCK_HEAD_START_MILLISECONDS = 3_600_000;
export const NOTIFY_WAIT_MILLISECONDS = 5_000;
export const DAILY_LIMIT_PER_USER = 1_000;
// O script fecha vários ciclos de disparo e rearme em segundos: o intervalo mínimo entre disparos fica desligado aqui.
export const NO_REFIRE_INTERVAL_MILLISECONDS = 0;
