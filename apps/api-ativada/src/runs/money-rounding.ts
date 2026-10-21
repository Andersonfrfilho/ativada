// Copyright (c) 2026 Ada Technology. All rights reserved.
import {
  formatEngineDecimal,
  ROUNDING_DIRECTION,
  roundMoney,
  type EngineDecimalValue,
} from '@ativada/strategy-engine';

// Dinheiro a 8 casas, sempre contra o usuário: o que se paga sobe, o que se recebe e o resultado descem.
export const roundMoneyUp = (value: EngineDecimalValue): EngineDecimalValue =>
  roundMoney({ value, direction: ROUNDING_DIRECTION.UP });

export const roundMoneyDown = (value: EngineDecimalValue): EngineDecimalValue =>
  roundMoney({ value, direction: ROUNDING_DIRECTION.DOWN });

export function formatOptionalDecimal(value: EngineDecimalValue | undefined): string | undefined {
  return value === undefined ? undefined : formatEngineDecimal(value);
}
