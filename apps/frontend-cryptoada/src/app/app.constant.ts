// Copyright (c) 2026 Ada Technology. All rights reserved.
export const SIMULATION_NOTICE =
  'Simulação com dinheiro fictício. Não é recomendação de investimento.';

export const APP_NAME = 'CryptoAdA';

export const ROUTE_PATH = {
  OVERVIEW: '/',
  ACCOUNT: '/conta',
  BACKTESTS: '/backtests',
  BACKTEST: '/backtests/:runId',
  BACKTEST_COMPARE: '/backtests/comparar',
  STRATEGIES: '/estrategias',
  STRATEGY: '/estrategias/:strategyId',
  ALERTS: '/alertas',
  LOGIN: '/login',
  AUTH_CALLBACK: '/auth/callback',
} as const;

export const API_PATH = {
  SESSION: '/v1/session',
  SESSION_REFRESH: '/v1/session/refresh',
  PROFILE: '/v1/me',
  PROFILE_EXPORT: '/v1/me/export',
  TELEGRAM_LINK: '/v1/me/telegram-link',
  RUNS: '/v1/runs',
  CANDLES: '/v1/markets/candles',
  STRATEGIES: '/v1/strategies',
  PRICE_ALERTS: '/v1/price-alerts',
  STREAM_TICKETS: '/v1/stream/tickets',
} as const;
