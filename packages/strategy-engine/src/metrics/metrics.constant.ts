// Copyright (c) 2026 Ada Technology. All rights reserved.

// Versão da fórmula das métricas: mudar qualquer definição do ADR 0002 §"Métricas" exige uma nova e o dourado regravado.
export const METRICS_VERSION = 'metrics-1';
// Casas de toda grandeza que sai de divisão, raiz ou potência; soma de dinheiro não é arredondada.
export const METRICS_DECIMAL_PLACES = 12;
export const MILLISECONDS_PER_DAY = 86_400_000;
// Ano de 365,25 dias: o período por ano de cada timeframe sai exato (1h = 8 766).
export const MILLISECONDS_PER_YEAR = 31_557_600_000;
export const MINIMUM_ANNUALIZATION_PERIOD_MILLISECONDS = 30 * MILLISECONDS_PER_DAY;
export const MINIMUM_RETURNS_FOR_RATIOS = 2;

export const METRIC_UNAVAILABLE_REASON = {
  NO_EQUITY_POINTS: 'no_equity_points',
  INSUFFICIENT_RETURNS: 'insufficient_returns',
  ZERO_VOLATILITY: 'zero_volatility',
  ZERO_DOWNSIDE: 'zero_downside',
  PERIOD_TOO_SHORT: 'period_too_short',
  NO_TRADES: 'no_trades',
  NO_LOSSES: 'no_losses',
  NO_WINS: 'no_wins',
} as const;

export type MetricUnavailableReason =
  (typeof METRIC_UNAVAILABLE_REASON)[keyof typeof METRIC_UNAVAILABLE_REASON];
