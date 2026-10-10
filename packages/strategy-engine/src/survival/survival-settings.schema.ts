// Copyright (c) 2026 Ada Technology. All rights reserved.
import { z } from 'zod';

import { decimalTextSchema } from '../decimal-text.schema.js';
import {
  DEFAULT_SURVIVAL_DOUBLE_RATE,
  DEFAULT_SURVIVAL_FLOOR_RATE,
  MAXIMUM_SURVIVAL_DOUBLE_RATE,
  SURVIVAL_ERROR_CODE,
  SURVIVAL_RATE_DECIMAL_PLACES,
} from './survival.constant.js';
import { SurvivalInputError } from './survival.error.js';
import type { SurvivalSettings } from './survival.types.js';

// Piso: fração do saldo inicial estritamente entre 0 e 1 (100% não é piso, 0% nunca é tocado).
const floorRateSchema = decimalTextSchema({
  minimum: '0',
  maximum: '1',
  isMinimumExclusive: true,
  isMaximumExclusive: true,
  maximumDecimalPlaces: SURVIVAL_RATE_DECIMAL_PLACES,
});

// Dobro: múltiplo estritamente maior que 1 do saldo inicial.
const doubleRateSchema = decimalTextSchema({
  minimum: '1',
  maximum: MAXIMUM_SURVIVAL_DOUBLE_RATE,
  isMinimumExclusive: true,
  maximumDecimalPlaces: SURVIVAL_RATE_DECIMAL_PLACES,
});

const SURVIVAL_SETTINGS_SCHEMA = z.strictObject({
  floorRate: floorRateSchema.default(DEFAULT_SURVIVAL_FLOOR_RATE),
  doubleRate: doubleRateSchema.default(DEFAULT_SURVIVAL_DOUBLE_RATE),
});

// Ausente vale o padrão do RF09; a grafia sai canônica ("0.80" = "0.8"). O erro nunca repete o valor recebido.
export function parseSurvivalSettings(input: unknown): SurvivalSettings {
  const parsed = SURVIVAL_SETTINGS_SCHEMA.safeParse(input ?? {});
  if (!parsed.success) {
    throw new SurvivalInputError(
      SURVIVAL_ERROR_CODE.INVALID_SETTINGS,
      'A configuração da sobrevivência do saldo não é válida.',
      parsed.error.issues.map((issue) => issue.path.join('.')),
    );
  }
  return parsed.data;
}
