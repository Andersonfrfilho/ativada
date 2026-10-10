// Copyright (c) 2026 Ada Technology. All rights reserved.
import { z } from 'zod';

import { decimalTextSchema } from './decimal-text.schema.js';
import { RULE_DISCRIMINATOR, STRATEGY_CONFIG_SCHEMA_VERSION } from './engine.constant.js';
import { ENTRY_ORDER_TYPE, REGIME_FILTER_KIND } from './engine-vocabulary.constant.js';
import { INDICATOR_PERIOD_SCHEMA, STRATEGY_RULES_SCHEMA } from './strategy-rule.schema.js';

const ZERO = '0';
const WEIGHT_SCHEMA = decimalTextSchema({ minimum: ZERO, maximum: '10' });

const FAMILY_WEIGHTS_SCHEMA = z.strictObject({
  trend: WEIGHT_SCHEMA,
  reversion: WEIGHT_SCHEMA,
  volume: WEIGHT_SCHEMA,
  sentiment: WEIGHT_SCHEMA,
});

// Defaults do "Placar clássico" (plan.md §4): tendência pesa em tendência, reversão em lateral.
const FAVORED_WEIGHT = '1.5';
const DISFAVORED_WEIGHT = '0.5';
const NEUTRAL_WEIGHT = '1';
const TRENDING_WEIGHTS = {
  trend: FAVORED_WEIGHT,
  reversion: DISFAVORED_WEIGHT,
  volume: NEUTRAL_WEIGHT,
  sentiment: NEUTRAL_WEIGHT,
};
const RANGING_WEIGHTS = {
  trend: DISFAVORED_WEIGHT,
  reversion: FAVORED_WEIGHT,
  volume: NEUTRAL_WEIGHT,
  sentiment: NEUTRAL_WEIGHT,
};
// 1% de risco por operação (RF05).
const ONE_HUNDREDTH = '0.01';

const ADX_REGIME_SCHEMA = z.strictObject({
  kind: z.literal(REGIME_FILTER_KIND.ADX),
  period: INDICATOR_PERIOD_SCHEMA.default(14),
  trendThreshold: z.number().int().min(1).max(100).default(25),
  weights: z
    .strictObject({ trending: FAMILY_WEIGHTS_SCHEMA, ranging: FAMILY_WEIGHTS_SCHEMA })
    .default({ trending: TRENDING_WEIGHTS, ranging: RANGING_WEIGHTS }),
});

const REGIME_SCHEMA = z
  .discriminatedUnion(RULE_DISCRIMINATOR, [
    z.strictObject({ kind: z.literal(REGIME_FILTER_KIND.NONE) }),
    ADX_REGIME_SCHEMA,
  ])
  .prefault({ kind: REGIME_FILTER_KIND.NONE });

const ENTRY_SCHEMA = z
  .discriminatedUnion('orderType', [
    z.strictObject({ orderType: z.literal(ENTRY_ORDER_TYPE.MARKET) }),
    z.strictObject({
      orderType: z.literal(ENTRY_ORDER_TYPE.LIMIT),
      offsetRate: decimalTextSchema({ minimum: ZERO, maximum: '0.2', isMinimumExclusive: true }),
      expiryCandles: z.number().int().min(1).max(100),
    }),
  ])
  .prefault({ orderType: ENTRY_ORDER_TYPE.MARKET });

const RISK_SCHEMA = z
  .strictObject({
    atrPeriod: INDICATOR_PERIOD_SCHEMA.default(14),
    stopAtrMultiple: decimalTextSchema({
      minimum: ZERO,
      maximum: '20',
      isMinimumExclusive: true,
    }).default('2'),
    targetAtrMultiple: decimalTextSchema({
      minimum: ZERO,
      maximum: '50',
      isMinimumExclusive: true,
    }).default('3'),
    riskPerTrade: decimalTextSchema({
      minimum: ZERO,
      maximum: '0.1',
      isMinimumExclusive: true,
    }).default(ONE_HUNDREDTH),
    maxExposureRate: decimalTextSchema({
      minimum: ZERO,
      maximum: '1',
      isMinimumExclusive: true,
    }).default('1'),
  })
  .prefault({});

const THRESHOLDS_SCHEMA = z.strictObject({
  buy: decimalTextSchema({ minimum: ZERO, maximum: '100', isMinimumExclusive: true }),
  sell: decimalTextSchema({ minimum: '-100', maximum: ZERO, isMaximumExclusive: true }),
});

// A versão da estratégia é só a lógica (RF03): par, timeframe, saldo, taxa, slippage e filtros da
// corretora são parâmetros da execução (RunParameters), com hash próprio (ADR 0002 §d).
export const STRATEGY_CONFIG_SCHEMA = z.strictObject({
  schemaVersion: z.literal(STRATEGY_CONFIG_SCHEMA_VERSION),
  rules: STRATEGY_RULES_SCHEMA,
  regime: REGIME_SCHEMA,
  thresholds: THRESHOLDS_SCHEMA,
  entry: ENTRY_SCHEMA,
  risk: RISK_SCHEMA,
});
