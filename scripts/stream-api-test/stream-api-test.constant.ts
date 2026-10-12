// Copyright (c) 2026 Ada Technology. All rights reserved.
export const TEMPORARY_DATABASE_PREFIX = 'ativada_stream_api_';
export const SYMBOL = 'ETHUSDT';
export const ALLOWED_ORIGIN = 'http://127.0.0.1:56103';
export const FOREIGN_ORIGIN = 'http://evil.example';
export const TICKETS_PATH = '/v1/stream/tickets';
export const STREAM_PATH = '/v1/stream';
// Dois sockets por usuário e varredura a cada 5 s: o teto e o vencimento do token se provam em segundos.
export const MAX_SOCKETS_PER_USER = '2';
export const PING_INTERVAL_SECONDS = '5';
export const PONG_TIMEOUT_SECONDS = '30';
export const SHORT_TOKEN_SECONDS = 4;
export const TICKER_STALE_SECONDS = '3';
// Do passo gravado ao socket do dono: o aceite é < 10 s (RNF03).
export const DELIVERY_BUDGET_MILLISECONDS = 10_000;
export const EVENT_WAIT_MILLISECONDS = 15_000;
// 10 tickets por minuto por IP: o teste não passa disso, ele espera a reposição do limitador.
export const TICKETS_PER_MINUTE_BUDGET = 9;
export const MINUTE_MILLISECONDS = 60_000;
export const ARRIVING_CANDLES = 40;
export const SUBJECT = {
  A: 'subject-stream-api-a',
  B: 'subject-stream-api-b',
  D: 'subject-stream-api-d',
  EXPIRING: 'subject-stream-api-expiring',
  RENEWING: 'subject-stream-api-renewing',
  BLOCKED: 'subject-stream-api-blocked',
  BYSTANDER: 'subject-stream-api-bystander',
  RENEW_BLOCKED: 'subject-stream-api-renew-blocked',
  SHUTDOWN: 'subject-stream-api-shutdown',
  MARKET_A: 'subject-stream-api-market-a',
  MARKET_B: 'subject-stream-api-market-b',
  ADMIN: 'subject-stream-api-admin',
} as const;
