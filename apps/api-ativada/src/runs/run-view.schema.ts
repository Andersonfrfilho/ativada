// Copyright (c) 2026 Ada Technology. All rights reserved.
import { GOAL_RUN_OUTCOME, RUN_KIND, RUN_STATUS } from '@ativada/database';
import { z } from '@ativada/environment';
import { ENGINE_TIMEFRAME, RUN_PARAMETERS_SCHEMA } from '@ativada/strategy-engine';

import {
  epochMillisecondsSchema,
  isoDateTimeSchema,
  resourceIdSchema,
} from '../openapi/schema-primitives.js';

const jsonObjectSchema = z.record(z.string(), z.unknown());

// O que `GET /v1/runs/:id` devolve. O mesmo esquema documenta a rota e confere a resposta nos contratos.
export const RUN_VIEW_SCHEMA = z.strictObject({
  id: resourceIdSchema,
  strategyVersionId: resourceIdSchema,
  kind: z.enum(RUN_KIND),
  status: z.enum(RUN_STATUS),
  symbol: z.string(),
  timeframe: z.enum(ENGINE_TIMEFRAME),
  runParameters: RUN_PARAMETERS_SCHEMA,
  periodStart: epochMillisecondsSchema,
  periodEnd: epochMillisecondsSchema.nullable(),
  progress: z.number().int().min(0).max(100),
  lastCandleTime: epochMillisecondsSchema.nullable(),
  metrics: jsonObjectSchema.nullable(),
  overfitting: jsonObjectSchema.nullable(),
  errorCode: z.string().nullable(),
  engineVersion: z.string(),
  signalEngineVersion: z.string(),
  metricsVersion: z.string(),
  createdAt: isoDateTimeSchema,
  startedAt: isoDateTimeSchema.nullable(),
  finishedAt: isoDateTimeSchema.nullable(),
  goalId: resourceIdSchema.nullable(),
  goalOutcome: z.enum(GOAL_RUN_OUTCOME).nullable(),
});

export const RUN_WARNING_SCHEMA = z.strictObject({ code: z.string(), message: z.string() });

export const RUN_QUEUE_POSITION_SCHEMA = z.strictObject({
  own: z.number().int().min(1),
  overall: z.number().int().min(1),
});

const SURVIVAL_MILESTONE_SCHEMA = z.strictObject({
  level: z.string(),
  isReached: z.boolean(),
  reachedAtCandleTime: epochMillisecondsSchema.nullable(),
  elapsedMilliseconds: z.number().int().min(0).nullable(),
  progress: z.string(),
});

// Sobrevivência do saldo (RF09): piso e meta de dobro, com o tempo até cada um quando atingido e o progresso enquanto não.
export const BALANCE_SURVIVAL_SCHEMA = z.strictObject({
  version: z.string(),
  initialBalance: z.string(),
  floor: SURVIVAL_MILESTONE_SCHEMA,
  double: SURVIVAL_MILESTONE_SCHEMA,
  lowestEquity: z.string().nullable(),
  highestEquity: z.string().nullable(),
  observedUntilCandleTime: epochMillisecondsSchema.nullable(),
  observedMilliseconds: z.number().int().min(0),
});

export const WAITING_FOR_DATA_SCHEMA = z.strictObject({
  since: epochMillisecondsSchema,
  openTime: epochMillisecondsSchema,
});

export const RUN_DETAIL_SCHEMA = RUN_VIEW_SCHEMA.extend({
  warnings: z.array(RUN_WARNING_SCHEMA),
  queuePosition: RUN_QUEUE_POSITION_SCHEMA.nullable(),
  // Só na simulação ao vivo; `null` nos demais tipos.
  survival: BALANCE_SURVIVAL_SCHEMA.nullable(),
  // Só enquanto a simulação ao vivo espera candles que faltam; `null` andando e nos demais tipos.
  waitingForData: WAITING_FOR_DATA_SCHEMA.nullable(),
});
