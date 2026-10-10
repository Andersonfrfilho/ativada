// Copyright (c) 2026 Ada Technology. All rights reserved.
import {
  ENGINE_INPUT_ERROR_CODE,
  EngineInputError,
} from '../../../packages/strategy-engine/src/index.js';

// Cada defeito é um motor quebrado de propósito: o harness tem de reprová-lo pelo motivo certo.
export const REFERENCE_ENGINE_DEFECT = {
  NONE: 'none',
  LOOKS_AT_FUTURE: 'looks-at-future',
  SENTIMENT_LOOKAHEAD: 'sentiment-lookahead',
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
  SIZE_AT_DECISION: 'size-at-decision',
  IGNORES_FEES_IN_SIZE: 'ignores-fees-in-size',
  STOP_FROM_DECISION_CLOSE: 'stop-from-decision-close',
  OVERSPENDS_CASH: 'overspends-cash',
  LIMIT_FILLS_ON_TOUCH: 'limit-fills-on-touch',
  TARGET_ON_TOUCH: 'target-on-touch',
  GAP_TARGET_AT_OPEN: 'gap-target-at-open',
  INTRA_CANDLE_LIMIT_TARGET: 'intra-candle-limit-target',
  LIMIT_EXPIRES_OFF_BY_ONE: 'limit-expires-off-by-one',
  RESTEP_NOT_IDEMPOTENT: 'restep-not-idempotent',
  IGNORES_OPPOSITE_SIGNAL: 'ignores-opposite-signal',
  ZERO_PRICE_ACCEPTED: 'zero-price-accepted',
  SPLIT_DIVERGES: 'split-diverges',
} as const;

export type ReferenceEngineDefect =
  (typeof REFERENCE_ENGINE_DEFECT)[keyof typeof REFERENCE_ENGINE_DEFECT];

// Defeito ZERO_PRICE_ACCEPTED: engole a recusa de candle insano e segue com o preço inválido.
export function guardInput(defect: ReferenceEngineDefect, assert: () => void): void {
  try {
    assert();
  } catch (error) {
    const isSwallowed =
      defect === REFERENCE_ENGINE_DEFECT.ZERO_PRICE_ACCEPTED &&
      error instanceof EngineInputError &&
      error.code === ENGINE_INPUT_ERROR_CODE.CANDLE_INSANE;
    if (!isSwallowed) throw error;
  }
}
