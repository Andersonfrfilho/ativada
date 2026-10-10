// Copyright (c) 2026 Ada Technology. All rights reserved.
import {
  ROUNDING_DIRECTION,
  roundToIncrement,
  toEngineDecimal,
  type EngineDecimalValue,
} from '../engine-decimal.js';

export function floorToIncrement(value: EngineDecimalValue, increment: string): EngineDecimalValue {
  return roundToIncrement({
    value,
    increment: toEngineDecimal(increment),
    direction: ROUNDING_DIRECTION.DOWN,
  });
}

export function ceilToIncrement(value: EngineDecimalValue, increment: string): EngineDecimalValue {
  return roundToIncrement({
    value,
    increment: toEngineDecimal(increment),
    direction: ROUNDING_DIRECTION.UP,
  });
}
