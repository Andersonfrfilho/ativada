// Copyright (c) 2026 Ada Technology. All rights reserved.

// Versão das contas do plano de operação ao vivo: mudar uma fórmula do ADR 0002 "Plano de operação ao vivo" exige outra.
export const TRADE_PLAN_VERSION = 'trade-plan-1';

// Taxas (fração) a 12 casas, como o acompanhamento; preço, quantidade e dinheiro saem exatos, na grade do motor.
export const TRADE_PLAN_RATE_DECIMAL_PLACES = 12;

// As equipes: as 3 recomendações agendadas mais novas de cada uma bastam para achar a última decidida.
export const TRADE_PLAN_TEAM_REPORTS = 3;

export const TRADE_PLAN_STATUS = {
  AWAITING_ENTRY: 'awaiting_entry',
  HOLDING: 'holding',
  UNAVAILABLE: 'unavailable',
} as const;

// Por que não há números, na ordem de precedência.
export const TRADE_PLAN_UNAVAILABLE_REASON = {
  NOT_RUNNING: 'not_running',
  STALLED: 'stalled',
  WAITING_FOR_DATA: 'waiting_for_data',
  NO_CANDLE: 'no_candle',
  // A vela decidida não tem ATR (aquecimento): o motor recusaria a entrada (`zero_atr`).
  NO_ATR: 'no_atr',
  // O stop sairia acima da venda possível (ATR pequeno demais para o tick e o deslizamento): o motor recusaria.
  INVALID_STOP: 'invalid_stop',
} as const;
export type TradePlanUnavailableReason =
  (typeof TRADE_PLAN_UNAVAILABLE_REASON)[keyof typeof TRADE_PLAN_UNAVAILABLE_REASON];

export const TEAM_PLAN_STATUS = { AVAILABLE: 'available', UNAVAILABLE: 'unavailable' } as const;

export const TEAM_PLAN_UNAVAILABLE_REASON = {
  // Nenhuma recomendação agendada decidida desta equipe neste par.
  NO_REPORT: 'no_report',
  // A última decidida é segurar ou vender: não há entrada a medir.
  NO_ENTRY: 'no_entry',
  // Os preços não cabem no motor (fora de `proteção < entrada < alvo` ou proteção acima da venda possível).
  INVALID_LEVELS: 'invalid_levels',
} as const;
export type TeamPlanUnavailableReason =
  (typeof TEAM_PLAN_UNAVAILABLE_REASON)[keyof typeof TEAM_PLAN_UNAVAILABLE_REASON];
