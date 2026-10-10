// Copyright (c) 2026 Ada Technology. All rights reserved.
import { z } from 'zod';

import { decimalTextSchema } from './decimal-text.schema.js';
import { CUSTOM_ISSUE_CODE, MAX_STRATEGY_RULES, RULE_DISCRIMINATOR } from './engine.constant.js';
import { RULE_KIND } from './engine-vocabulary.constant.js';

const RULE_ID_SCHEMA = z
  .string()
  .regex(/^[a-z0-9][a-z0-9-]{0,39}$/, 'Use minúsculas, dígitos e hífen (até 40 caracteres).');
export const INDICATOR_PERIOD_SCHEMA = z.number().int().min(2).max(500);
const PERCENT_LEVEL_SCHEMA = z.number().int().min(0).max(100);
const FAST_BEFORE_SLOW = {
  message: 'O período rápido precisa ser menor que o lento.',
  path: ['fastPeriod'],
};

const EMA_CROSS_RULE_SCHEMA = z
  .strictObject({
    id: RULE_ID_SCHEMA,
    kind: z.literal(RULE_KIND.EMA_CROSS),
    fastPeriod: INDICATOR_PERIOD_SCHEMA,
    slowPeriod: INDICATOR_PERIOD_SCHEMA,
  })
  .refine((rule) => rule.fastPeriod < rule.slowPeriod, FAST_BEFORE_SLOW);

const MACD_RULE_SCHEMA = z
  .strictObject({
    id: RULE_ID_SCHEMA,
    kind: z.literal(RULE_KIND.MACD),
    fastPeriod: INDICATOR_PERIOD_SCHEMA,
    slowPeriod: INDICATOR_PERIOD_SCHEMA,
    signalPeriod: INDICATOR_PERIOD_SCHEMA,
  })
  .refine((rule) => rule.fastPeriod < rule.slowPeriod, FAST_BEFORE_SLOW);

const DONCHIAN_RULE_SCHEMA = z.strictObject({
  id: RULE_ID_SCHEMA,
  kind: z.literal(RULE_KIND.DONCHIAN_BREAKOUT),
  period: INDICATOR_PERIOD_SCHEMA,
});

const RSI_RULE_SCHEMA = z
  .strictObject({
    id: RULE_ID_SCHEMA,
    kind: z.literal(RULE_KIND.RSI),
    period: INDICATOR_PERIOD_SCHEMA,
    oversold: PERCENT_LEVEL_SCHEMA,
    overbought: PERCENT_LEVEL_SCHEMA,
  })
  .refine((rule) => rule.oversold < rule.overbought, {
    message: 'O nível de sobrevenda precisa ser menor que o de sobrecompra.',
    path: ['oversold'],
  });

const BOLLINGER_RULE_SCHEMA = z.strictObject({
  id: RULE_ID_SCHEMA,
  kind: z.literal(RULE_KIND.BOLLINGER),
  period: INDICATOR_PERIOD_SCHEMA,
  // Texto decimal com uma casa: `multipleOf(0.1)` em float recusaria 0.3 (0.30000000000000004).
  deviations: decimalTextSchema({ minimum: '0.5', maximum: '5', maximumDecimalPlaces: 1 }),
});

const OBV_TREND_RULE_SCHEMA = z.strictObject({
  id: RULE_ID_SCHEMA,
  kind: z.literal(RULE_KIND.OBV_TREND),
  emaPeriod: INDICATOR_PERIOD_SCHEMA,
});

const FEAR_GREED_RULE_SCHEMA = z
  .strictObject({
    id: RULE_ID_SCHEMA,
    kind: z.literal(RULE_KIND.FEAR_GREED),
    fearAtOrBelow: PERCENT_LEVEL_SCHEMA,
    greedAtOrAbove: PERCENT_LEVEL_SCHEMA,
  })
  .refine((rule) => rule.fearAtOrBelow < rule.greedAtOrAbove, {
    message: 'O nível de medo precisa ser menor que o de ganância.',
    path: ['fearAtOrBelow'],
  });

export const STRATEGY_RULE_SCHEMA = z.discriminatedUnion(RULE_DISCRIMINATOR, [
  EMA_CROSS_RULE_SCHEMA,
  MACD_RULE_SCHEMA,
  DONCHIAN_RULE_SCHEMA,
  RSI_RULE_SCHEMA,
  BOLLINGER_RULE_SCHEMA,
  OBV_TREND_RULE_SCHEMA,
  FEAR_GREED_RULE_SCHEMA,
]);

export const STRATEGY_RULES_SCHEMA = z
  .array(STRATEGY_RULE_SCHEMA)
  .min(1)
  .max(MAX_STRATEGY_RULES)
  .superRefine((rules, context) => {
    const seenIds = new Set<string>();
    rules.forEach((rule, index) => {
      if (seenIds.has(rule.id)) {
        context.addIssue({
          code: CUSTOM_ISSUE_CODE,
          message: 'Id de regra repetido.',
          path: [index, 'id'],
        });
      }
      seenIds.add(rule.id);
    });
  });
