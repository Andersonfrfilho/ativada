// Copyright (c) 2026 Ada Technology. All rights reserved.

export const PRICE_ALERT_SYMBOL_MAX_LENGTH = 20;
export const PRICE_ALERT_SYMBOL_PATTERN = '^[A-Z0-9]{2,16}USDT$';
export const PRICE_ALERT_PAGE_MAXIMUM_SIZE = 100;
// `numeric` sem precisão guarda qualquer decimal; o teto do valor mantém o texto dentro do que o motor e o painel leem.
export const PRICE_ALERT_MAXIMUM_VALUE = '1000000000';

// Subir acima de um valor ou cair abaixo dele.
export const PRICE_ALERT_DIRECTION = { ABOVE: 'above', BELOW: 'below' } as const;
export type PriceAlertDirection =
  (typeof PRICE_ALERT_DIRECTION)[keyof typeof PRICE_ALERT_DIRECTION];

// `manual`: o usuário digitou. `plan`: nasceu de um preço do plano da meta ("Avisar no plano").
export const PRICE_ALERT_ORIGIN = { MANUAL: 'manual', PLAN: 'plan' } as const;
export type PriceAlertOrigin = (typeof PRICE_ALERT_ORIGIN)[keyof typeof PRICE_ALERT_ORIGIN];

export const PRICE_ALERT_CREATE_OUTCOME = {
  CREATED: 'created',
  LIMIT_REACHED: 'limit_reached',
} as const;

export const PRICE_ALERT_UPDATE_OUTCOME = {
  UPDATED: 'updated',
  NOT_FOUND: 'not_found',
  LIMIT_REACHED: 'limit_reached',
} as const;
