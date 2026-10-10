// Copyright (c) 2026 Ada Technology. All rights reserved.
import { z } from 'zod';

import { decimalTextSchema } from '../decimal-text.schema.js';
import { MONEY_DECIMAL_PLACES } from '../engine.constant.js';
import {
  GOAL_ERROR_CODE,
  MAXIMUM_GOAL_HORIZON_DAYS,
  MAXIMUM_GOAL_TARGET_RATE,
} from './goal.constant.js';
import { GoalInputError } from './goal.error.js';
import type { GoalSpec } from './goal.types.js';

// Ganho alvo: fração estritamente positiva (zero nunca falha, nem é meta).
const targetRateSchema = decimalTextSchema({
  minimum: '0',
  maximum: MAXIMUM_GOAL_TARGET_RATE,
  isMinimumExclusive: true,
  maximumDecimalPlaces: MONEY_DECIMAL_PLACES,
});

// Perda máxima: fração estritamente entre 0 e 1 (100% de perda não é limite, 0% nunca deixaria entrar).
const maxLossRateSchema = decimalTextSchema({
  minimum: '0',
  maximum: '1',
  isMinimumExclusive: true,
  isMaximumExclusive: true,
  maximumDecimalPlaces: MONEY_DECIMAL_PLACES,
});

const GOAL_SPEC_SCHEMA = z.strictObject({
  targetRate: targetRateSchema,
  maxLossRate: maxLossRateSchema,
  horizonDays: z.number().int().min(1).max(MAXIMUM_GOAL_HORIZON_DAYS),
});

// A grafia sai canônica ("0.030" = "0.03"); o erro nunca repete o valor recebido.
export function parseGoalSpec(input: unknown): GoalSpec {
  const parsed = GOAL_SPEC_SCHEMA.safeParse(input);
  if (!parsed.success) {
    throw new GoalInputError(
      GOAL_ERROR_CODE.INVALID_GOAL,
      'A meta não é válida.',
      parsed.error.issues.map((issue) => issue.path.join('.')),
    );
  }
  return parsed.data;
}
