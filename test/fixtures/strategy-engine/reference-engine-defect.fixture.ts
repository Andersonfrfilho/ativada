// Copyright (c) 2026 Ada Technology. All rights reserved.

// Cada defeito é um motor quebrado de propósito: o harness tem de reprová-lo pelo motivo certo.
export const REFERENCE_ENGINE_DEFECT = {
  NONE: 'none',
  LOOKS_AT_FUTURE: 'looks-at-future',
  READS_CLOCK: 'reads-clock',
  FILLS_AT_DECISION_CLOSE: 'fills-at-decision-close',
  IGNORES_FEE: 'ignores-fee',
  IGNORES_SLIPPAGE: 'ignores-slippage',
  TARGET_BEFORE_STOP: 'target-before-stop',
  STOP_PRICE_ON_GAP: 'stop-price-on-gap',
  HIDDEN_STATE: 'hidden-state',
  NON_SERIALIZABLE_STATE: 'non-serializable-state',
  ALLOWS_SECOND_POSITION: 'allows-second-position',
  LIMIT_NEVER_EXPIRES: 'limit-never-expires',
  MUTATES_INPUT_STATE: 'mutates-input-state',
} as const;

export type ReferenceEngineDefect =
  (typeof REFERENCE_ENGINE_DEFECT)[keyof typeof REFERENCE_ENGINE_DEFECT];
