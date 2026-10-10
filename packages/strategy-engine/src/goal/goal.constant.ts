// Copyright (c) 2026 Ada Technology. All rights reserved.

// Versão da fórmula: mudar qualquer definição do ADR 0002 §"Metas (T4b.1)" exige uma nova.
export const GOAL_VERSION = 'goal-1';
export const GOAL_RATE_DECIMAL_PLACES = 8;
export const GOAL_MEDIAN_DECIMAL_PLACES = 2;
export const MAXIMUM_GOAL_HORIZON_DAYS = 365;
export const MAXIMUM_GOAL_TARGET_RATE = '10';

// Desfecho de uma janela: o alvo veio antes, a perda máxima tocou antes, ou o prazo acabou sem nenhum dos dois.
export const GOAL_OUTCOME = {
  REACHED: 'reached',
  STOPPED: 'stopped',
  EXPIRED: 'expired',
} as const;
export type GoalOutcome = (typeof GOAL_OUTCOME)[keyof typeof GOAL_OUTCOME];

// A régua de três posições (ADR 0002 §"Metas (T4b.1)"): texto que o cliente lê.
export const GOAL_VERDICT = { BUY: 'COMPRAR', HOLD: 'SEGURAR', AVOID: 'EVITAR' } as const;
export type GoalVerdict = (typeof GOAL_VERDICT)[keyof typeof GOAL_VERDICT];

// Limiares fixos da régua, sobre as contagens exatas (nunca sobre a taxa arredondada):
//  - menos de `minimumWindows` janelas: sem base para decidir, SEGURAR;
//  - EVITAR se bateu o stop em `avoidMinimumStopRate` ou mais das janelas, ou chegou ao alvo em
//    `avoidMaximumReachRate` ou menos;
//  - COMPRAR se chegou ao alvo em `buyMinimumReachRate` ou mais E bateu o stop em `buyMaximumStopRate` ou menos;
//  - o resto é SEGURAR.
export const GOAL_VERDICT_RULES = {
  minimumWindows: 20,
  buyMinimumReachRate: '0.5',
  buyMaximumStopRate: '0.25',
  avoidMinimumStopRate: '0.4',
  avoidMaximumReachRate: '0.15',
} as const;

export const GOAL_ERROR_CODE = {
  INVALID_GOAL: 'INVALID_GOAL',
  INVALID_CANDLES: 'INVALID_CANDLES',
  CANDLES_NOT_CONTIGUOUS: 'CANDLES_NOT_CONTIGUOUS',
  INVALID_SENTIMENTS: 'INVALID_SENTIMENTS',
} as const;
export type GoalErrorCode = (typeof GOAL_ERROR_CODE)[keyof typeof GOAL_ERROR_CODE];
