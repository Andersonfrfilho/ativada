// Copyright (c) 2026 Ada Technology. All rights reserved.
import { ORDER_EVENT_REASON } from '../engine-vocabulary.constant.js';

// Resultado do dimensionamento: o que limitou a quantidade, ou por que não há quantidade (ADR 0002 §c).
export const SIZING_CONSTRAINT = {
  NONE: 'none',
  EXPOSURE_CAPPED: 'exposure_capped',
  CASH_CAPPED: 'cash_capped',
  VOLUME_CAPPED: ORDER_EVENT_REASON.VOLUME_CAPPED,
  BELOW_MIN_NOTIONAL: ORDER_EVENT_REASON.BELOW_MIN_NOTIONAL,
  INVALID_STOP: ORDER_EVENT_REASON.INVALID_STOP,
  ZERO_RISK: 'zero_risk',
} as const;
export type SizingConstraint = (typeof SIZING_CONSTRAINT)[keyof typeof SIZING_CONSTRAINT];

export const PROTECTIVE_REFUSAL = {
  ZERO_ATR: ORDER_EVENT_REASON.ZERO_ATR,
  INVALID_STOP: ORDER_EVENT_REASON.INVALID_STOP,
  STOP_BELOW_TICK: 'stop_below_tick',
} as const;
export type ProtectiveRefusal = (typeof PROTECTIVE_REFUSAL)[keyof typeof PROTECTIVE_REFUSAL];

export const RUN_PARAMETER_WARNING = {
  TICK_DOMINATES_SLIPPAGE: 'tick_dominates_slippage',
  QUANTITY_STEP_EXCEEDS_BALANCE: 'quantity_step_exceeds_balance',
  QUANTITY_STEP_COARSE: 'quantity_step_coarse',
  MIN_NOTIONAL_EXCEEDS_BALANCE: 'min_notional_exceeds_balance',
} as const;
export type RunParameterWarningCode =
  (typeof RUN_PARAMETER_WARNING)[keyof typeof RUN_PARAMETER_WARNING];

// Cada arredondamento de dinheiro erra no máximo 1e-8. O débito soma 2 (valor e taxa, para cima); a perda
// soma 4 (esses dois, mais o valor da saída para baixo e a taxa de saída para cima). Descontar a folga
// ANTES de dividir garante perda < risco e débito < caixa sem laço de ajuste.
export const DEBIT_ROUNDING_UNITS = 2;
export const LOSS_ROUNDING_UNITS = 4;

// Avisos de parâmetros (RunParameters): não são erros, o backtest os mostra.
export const TICK_NOTICEABLE_RATE = '0.0001';
export const COARSE_STEP_BALANCE_SHARE = '0.05';
export const PERCENT_FACTOR = 100;
