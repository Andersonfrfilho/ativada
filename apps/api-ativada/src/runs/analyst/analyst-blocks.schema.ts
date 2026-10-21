// Copyright (c) 2026 Ada Technology. All rights reserved.
import { z } from '@ativada/environment';
import {
  ANALYST_COMMAND_KIND,
  ANALYST_COMMAND_REASON,
  ANALYST_REASON,
  ENTRY_GATE,
  FORECAST_SIDE,
  FORECAST_STRENGTH,
  LOCK_KEY,
  NO_FORECAST_REASON,
  POSTURE,
  SPECIALIST_KEY,
  STRATEGY_AUDIT_KEY,
} from '@ativada/risk-analyst';
import { COIN_FLIP_VERDICT } from '@ativada/statistics';

import { decimalTextSchema } from '../../openapi/schema-primitives.js';

const nullableDecimal = decimalTextSchema.nullable();
const count = z.number().int().nonnegative();

export const CADENCE_SCHEMA = z.union([z.literal(15), z.literal(60), z.literal(240)]);

export const FORECAST_SCHEMA = z.strictObject({
  side: z.enum(FORECAST_SIDE).nullable(),
  strength: z.enum(FORECAST_STRENGTH).nullable(),
  noForecastReason: z.enum(NO_FORECAST_REASON).nullable(),
  forWeight: decimalTextSchema,
  againstWeight: decimalTextSchema,
  provenWeight: decimalTextSchema,
});

export const READINGS_SCHEMA = z.strictObject({
  relativeVolume: nullableDecimal,
  atrRate: nullableDecimal,
  atrPercentile90: nullableDecimal,
  atrPercentile95: nullableDecimal,
  momentumShort: nullableDecimal,
  momentumLong: nullableDecimal,
  roundTripCost: decimalTextSchema,
  moveToCost: nullableDecimal,
});

export const COMMAND_SCHEMA = z.strictObject({
  commandId: z.string(),
  kind: z.enum(ANALYST_COMMAND_KIND),
  reason: z.enum(ANALYST_COMMAND_REASON),
});

export const STORED_LOCK_SCHEMA = z.strictObject({
  key: z.enum(LOCK_KEY),
  current: nullableDecimal,
  limit: decimalTextSchema,
  isActive: z.boolean(),
  isApplicable: z.boolean(),
});

// O voto de cada regra do especialista naquela vela (D4-A da spec 011); decisão gravada antes dele não o tem.
const RULE_VOTE_SCHEMA = z.object({
  ruleId: z.string(),
  vote: z.union([z.literal(-1), z.literal(0), z.literal(1)]),
  reading: z.number().nullable(),
});

const SPECIALIST_KEY_SCHEMA = z.union([z.enum(SPECIALIST_KEY), z.literal(STRATEGY_AUDIT_KEY)]);

// Como o auditor grava cada especialista; campos novos que o worker acrescentar depois não derrubam a leitura.
export const STORED_SPECIALIST_SCHEMA = z.object({
  key: SPECIALIST_KEY_SCHEMA,
  vote: z.union([z.literal(-1), z.literal(0), z.literal(1)]).nullable(),
  isUnread: z.boolean(),
  predictions: count,
  counted: count,
  hits: count,
  misses: count,
  ties: count,
  upMoves: count,
  hitRate: nullableDecimal,
  upRate: nullableDecimal,
  verdict: z.enum(COIN_FLIP_VERDICT),
  lower: nullableDecimal,
  upper: nullableDecimal,
  weight: decimalTextSchema,
  ruleVotes: z.array(RULE_VOTE_SCHEMA).optional(),
});

// A linha de uma vela decidida como a tabela guarda: escalares e blocos juntos, para uma leitura só validar tudo.
export const STORED_DECISION_SCHEMA = z.object({
  version: z.string(),
  candleTime: z.number().int().nonnegative(),
  posture: z.enum(POSTURE),
  reason: z.enum(ANALYST_REASON),
  cadenceMinutes: CADENCE_SCHEMA,
  entryGate: z.enum(ENTRY_GATE),
  riskScale: decimalTextSchema,
  isTimeExitDue: z.boolean(),
  message: z.string(),
  forecast: FORECAST_SCHEMA,
  readings: READINGS_SCHEMA,
  specialists: z.array(STORED_SPECIALIST_SCHEMA),
  locks: z.array(STORED_LOCK_SCHEMA),
  commands: z.array(COMMAND_SCHEMA),
});

export type StoredDecision = z.infer<typeof STORED_DECISION_SCHEMA>;
