// Copyright (c) 2026 Ada Technology. All rights reserved.

// Versão da definição do plano: mudar qualquer fórmula do ADR 0002 §"Plano de operação (T4b.5)" exige uma nova.
export const PLAN_VERSION = 'plan-1';
export const PLAN_DECIMAL_PLACES = 8;

// `price`: o fechamento que faz a regra disparar no próximo candle. `already_active`: ela já sinalizou no último candle.
// `unreachable`: nenhum fechamento dentro da faixa de busca a faz disparar.
export const PLAN_STATUS = {
  PRICE: 'price',
  ALREADY_ACTIVE: 'already_active',
  UNREACHABLE: 'unreachable',
} as const;
export type PlanStatus = (typeof PLAN_STATUS)[keyof typeof PLAN_STATUS];

// Em qual lado do preço a regra dispara: `at_or_above` = fechar NO preço ou acima dele; `at_or_below` = no preço ou abaixo.
export const PLAN_TRIGGER = { AT_OR_ABOVE: 'at_or_above', AT_OR_BELOW: 'at_or_below' } as const;
export type PlanTrigger = (typeof PLAN_TRIGGER)[keyof typeof PLAN_TRIGGER];

// Onde o preço fica em relação ao último fechamento.
export const PLAN_DIRECTION = { ABOVE: 'above', BELOW: 'below' } as const;
export type PlanDirection = (typeof PLAN_DIRECTION)[keyof typeof PLAN_DIRECTION];

// `exact`: o preço só depende do fechamento do próximo candle. `indicative`: depende também do volume ou da amplitude dele
// (OBV e filtro de regime ADX), que ainda não existem.
export const PLAN_BASIS = { EXACT: 'exact', INDICATIVE: 'indicative' } as const;
export type PlanBasis = (typeof PLAN_BASIS)[keyof typeof PLAN_BASIS];

// A busca cobre de um tick até (1 + taxa) vezes o último fechamento: acima disso a regra é dada como inalcançável.
export const PLAN_SEARCH_MAXIMUM_RATE = '3';
