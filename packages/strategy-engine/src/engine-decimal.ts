// Copyright (c) 2026 Ada Technology. All rights reserved.
import { Decimal } from 'decimal.js';

import { INDICATOR_SIGNIFICANT_DIGITS, MONEY_DECIMAL_PLACES } from './engine.constant.js';
import { StrategyEngineError } from './strategy-engine.error.js';

// Clone isolado: configurar o `Decimal` global mudaria o comportamento de qualquer outro consumidor.
export const EngineDecimal = Decimal.clone({
  precision: 40,
  rounding: Decimal.ROUND_HALF_UP,
  toExpNeg: -40,
  toExpPos: 40,
});

export type EngineDecimalValue = Decimal;

export const ROUNDING_DIRECTION = { UP: 'up', DOWN: 'down' } as const;
export type RoundingDirection = (typeof ROUNDING_DIRECTION)[keyof typeof ROUNDING_DIRECTION];

export type RoundToIncrementParams = {
  readonly value: EngineDecimalValue;
  readonly increment: EngineDecimalValue;
  readonly direction: RoundingDirection;
};

export function toEngineDecimal(text: string): EngineDecimalValue {
  return new EngineDecimal(text);
}

// Forma única de serializar: notação comum, sem expoente e sem zeros à direita; "-0" vira "0".
export function formatEngineDecimal(value: EngineDecimalValue): string {
  return value.isZero() ? '0' : value.toFixed();
}

function toRoundingMode(direction: RoundingDirection): Decimal.Rounding {
  return direction === ROUNDING_DIRECTION.UP ? Decimal.ROUND_CEIL : Decimal.ROUND_FLOOR;
}

// Preço ao tick e quantidade ao passo: a direção é sempre a desfavorável ao usuário (ADR 0002 §c).
export function roundToIncrement(params: RoundToIncrementParams): EngineDecimalValue {
  const steps = params.value
    .dividedBy(params.increment)
    .toDecimalPlaces(0, toRoundingMode(params.direction));
  return steps.times(params.increment);
}

export function roundMoney(params: {
  readonly value: EngineDecimalValue;
  readonly direction: RoundingDirection;
}): EngineDecimalValue {
  return params.value.toDecimalPlaces(MONEY_DECIMAL_PLACES, toRoundingMode(params.direction));
}

// Única porta do float do indicador para o decimal do dinheiro; toPrecision é exato pela especificação.
export function decimalFromIndicator(value: number): EngineDecimalValue {
  if (!Number.isFinite(value)) {
    throw new StrategyEngineError('Valor de indicador não finito não cruza para decimal.');
  }
  return new EngineDecimal(value.toPrecision(INDICATOR_SIGNIFICANT_DIGITS));
}
