// Copyright (c) 2026 Ada Technology. All rights reserved.
export const TEMPORARY_DATABASE_PREFIX = 'ativada_api_runs_';
export const EXCHANGE = 'binance';
export const SYMBOL = 'BTCUSDT';
export const SUBJECT_A = 'subject-api-runs-a';
export const SUBJECT_B = 'subject-api-runs-b';
export const SUBJECT_EXAMPLE = 'subject-api-runs-example';
export const SUBJECT_EXAMPLE_RACE = 'subject-api-runs-example-race';
export const HEALTH_PATH = '/v1/health';
export const HEALTH_BUDGET_MILLISECONDS = 100;
// A rota de saúde tem 600/min por IP: uma amostra a cada 120 ms (500/min) fica abaixo.
export const HEALTH_SAMPLE_PAUSE_MILLISECONDS = 120;
// O limite geral de 120/min por usuário repõe 2 por segundo: consulta a cada 700 ms (1,4/s) se sustenta.
export const POLL_PAUSE_MILLISECONDS = 700;
export const RUN_TIMEOUT_MILLISECONDS = 180_000;
export const HOUR_MILLISECONDS = 3_600_000;
export const DAY_MILLISECONDS = 86_400_000;
export const SERIES_PAGE_SIZE = 100;
export const MISSING_ID = '0192f3a1-7c4e-7b2a-9d3f-5e6a7b8c9dff';
export const CSV_LINE_BREAK = '\r\n';
