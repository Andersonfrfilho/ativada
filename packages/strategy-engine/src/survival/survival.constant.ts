// Copyright (c) 2026 Ada Technology. All rights reserved.

// Versão da fórmula: mudar qualquer definição do ADR 0002 §"Sobrevivência do saldo" exige uma nova.
export const SURVIVAL_VERSION = 'survival-1';
// Piso padrão do RF09: 80% do saldo inicial; meta de dobro: 2× o saldo inicial.
export const DEFAULT_SURVIVAL_FLOOR_RATE = '0.8';
export const DEFAULT_SURVIVAL_DOUBLE_RATE = '2';
export const MAXIMUM_SURVIVAL_DOUBLE_RATE = '100';
export const SURVIVAL_RATE_DECIMAL_PLACES = 4;
// O progresso é uma fração de 0 a 1 com 4 casas: consumo do piso arredondado para cima (pior), ganho para baixo (pior).
export const SURVIVAL_PROGRESS_DECIMAL_PLACES = 4;
export const SURVIVAL_PROGRESS_COMPLETE = '1';
export const SURVIVAL_PROGRESS_NONE = '0';

export const SURVIVAL_ERROR_CODE = {
  INVALID_INITIAL_BALANCE: 'INVALID_INITIAL_BALANCE',
  INVALID_SETTINGS: 'INVALID_SETTINGS',
  INVALID_TIME: 'INVALID_TIME',
  INVALID_POINT: 'INVALID_POINT',
  POINTS_OUT_OF_ORDER: 'POINTS_OUT_OF_ORDER',
} as const;

export type SurvivalErrorCode = (typeof SURVIVAL_ERROR_CODE)[keyof typeof SURVIVAL_ERROR_CODE];
