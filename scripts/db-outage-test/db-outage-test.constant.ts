// Copyright (c) 2026 Ada Technology. All rights reserved.
export const REFERENCE_DATABASE_PREFIX = 'ativada_outage_ref_';
export const SUBJECT_DATABASE_PREFIX = 'ativada_outage_run_';
export const WORKER_ENTRYPOINT = 'apps/worker-ativada/src/main.ts';
export const EXCHANGE = 'binance';
export const MARKET_SYMBOL = 'ETHUSDT';
export const MARKET_TIMEFRAME = '1h';
export const HOUR_MILLISECONDS = 3_600_000;

// Quanto a queda dura (RNF01: 30 s) e quanto a volta pode levar depois que o banco volta a aceitar conexão.
export const OUTAGE_MILLISECONDS = 30_000;
export const RECOVERY_LIMIT_MILLISECONDS = 60_000;
export const POLL_MILLISECONDS = 250;
export const WAIT_TIMEOUT_MILLISECONDS = 120_000;

// Intervalos curtos para o teste caber em minutos; o contrato (teto de tempo, backoff, limiar) é o de produção.
export const WORKER_HEARTBEAT_SECONDS = 5;
export const DATABASE_QUERY_TIMEOUT_SECONDS = 5;
export const LIVE_POLL_SECONDS = 1;
export const STREAM_STALE_SECONDS = 30;
export const STREAM_GAP_LOOKBACK_HOURS = 1;
export const STALE_AFTER_MILLISECONDS = WORKER_HEARTBEAT_SECONDS * 3 * 1_000;

// Velas que chegam ANTES da queda; o resto chega com o worker às cegas.
export const CANDLES_BEFORE_OUTAGE = 60;
export const NEW_CANDLES = 306;

// Cada laço do worker (ao vivo, alertas, recuperação de lacunas, batimento) escreve no máximo um resumo por minuto.
export const WORKER_LOOPS = 4;
export const MAX_SUMMARY_LINES = WORKER_LOOPS * 2;
export const FORBIDDEN_LOG_TEXT = ['postgres://', 'Failed query', 'select 1'] as const;
export const CRASH_MESSAGES = [
  'live tick failed',
  'alert dispatch failed',
  'gap recovery failed',
  'worker heartbeat failed',
] as const;

// A parada da simulação (spec 006, Fase 2): a API varre a cada poucos segundos e a carência é a de produção (15 min).
export const STALL_SWEEP_SECONDS = 5;
export const STALL_GRACE_MINUTES = 15;
export const STALL_CHAT = '750000001';
