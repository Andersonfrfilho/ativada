// Copyright (c) 2026 Ada Technology. All rights reserved.

export const GOAL_SYMBOL_MAX_LENGTH = 20;
export const GOAL_SYMBOL_PATTERN = '^[A-Z0-9]{2,16}USDT$';
// Defesa em profundidade: a API valida a meta pelo motor, e o banco recusa o que ele jamais deixaria passar.
export const GOAL_MAXIMUM_HORIZON_DAYS = 365;
export const GOAL_MAXIMUM_TARGET_RATE = '10';
export const GOAL_PAGE_MAXIMUM_SIZE = 100;

export const GOAL_CREATE_OUTCOME = { CREATED: 'created', LIMIT_REACHED: 'limit_reached' } as const;
export const GOAL_DELETE_OUTCOME = {
  DELETED: 'deleted',
  NOT_FOUND: 'not_found',
  IN_USE: 'in_use',
} as const;

// Como uma simulação ao vivo atrelada a uma meta terminou: o alvo veio, a perda máxima tocou, ou o prazo venceu.
export const GOAL_RUN_OUTCOME = {
  REACHED: 'goal_reached',
  STOPPED: 'goal_stopped',
  EXPIRED: 'goal_expired',
} as const;
export type GoalRunOutcome = (typeof GOAL_RUN_OUTCOME)[keyof typeof GOAL_RUN_OUTCOME];
