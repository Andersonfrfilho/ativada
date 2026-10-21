// Copyright (c) 2026 Ada Technology. All rights reserved.

// Taxas e diferenças saem do servidor com 12 casas (ADR 0002, spec 008, L6 e L7); o texto exibido usa 2.
export const LIVE_RATE_DECIMAL_PLACES = 12;
export const PERCENT_MULTIPLIER = 100;

// Abaixo de 0,01 ponto percentual de diferença a estratégia está "empatada" com comprar e segurar (L7).
export const EVEN_DIFFERENCE_POINTS = '0.01';

export const BUY_AND_HOLD_COMPARISON = { ABOVE: 'above', BELOW: 'below', EVEN: 'even' } as const;
export type BuyAndHoldComparison =
  (typeof BUY_AND_HOLD_COMPARISON)[keyof typeof BUY_AND_HOLD_COMPARISON];

// O que a decisão da vela significou para a carteira (ADR 0002, spec 008, L12 e L21): BUY livre compra (se a ordem
// preencheu; na última vela ainda está pendente), SELL comprada vende e alvo, stop, lacuna ou comando saem sem sinal.
export const DECISION_OUTCOME = {
  WAITED: 'waited',
  BOUGHT: 'bought',
  BUY_PENDING: 'buy_pending',
  SOLD: 'sold',
  EXITED: 'exited',
} as const;
export type DecisionOutcome = (typeof DECISION_OUTCOME)[keyof typeof DECISION_OUTCOME];

// Por que não há gatilho (L3), na ordem de precedência.
export const TRIGGER_UNAVAILABLE_REASON = {
  NOT_RUNNING: 'not_running',
  NO_CANDLE: 'no_candle',
  WARMING_UP: 'warming_up',
  // A simulação segue a leitura gravada de uma equipe de modelo (spec 015): não há régua de placar a mostrar.
  TEAM_RUN: 'team_run',
} as const;
export type TriggerUnavailableReason =
  (typeof TRIGGER_UNAVAILABLE_REASON)[keyof typeof TRIGGER_UNAVAILABLE_REASON];
