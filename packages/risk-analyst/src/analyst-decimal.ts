// Copyright (c) 2026 Ada Technology. All rights reserved.
import {
  EngineDecimal,
  formatEngineDecimal,
  toEngineDecimal,
  type EngineDecimalValue,
} from '@ativada/strategy-engine';

import { ANALYST_RULES } from './analyst.constant.js';

// Divisão a 12 casas arredondada para BAIXO (A8): o texto canônico do motor, sem zeros à direita.
export function divideDown(numerator: EngineDecimalValue, denominator: EngineDecimalValue): string {
  const quotient = numerator.dividedBy(denominator);
  return formatEngineDecimal(
    quotient.toDecimalPlaces(ANALYST_RULES.decimalPlaces, EngineDecimal.ROUND_FLOOR),
  );
}

export function divideUp(numerator: EngineDecimalValue, denominator: EngineDecimalValue): string {
  const quotient = numerator.dividedBy(denominator);
  return formatEngineDecimal(
    quotient.toDecimalPlaces(ANALYST_RULES.decimalPlaces, EngineDecimal.ROUND_CEIL),
  );
}

export function sumTexts(values: readonly string[]): EngineDecimalValue {
  return values.reduce((total, value) => total.plus(value), new EngineDecimal(0));
}

export function decimalOf(text: string): EngineDecimalValue {
  return toEngineDecimal(text);
}
