// Copyright (c) 2026 Ada Technology. All rights reserved.
import { RUN_KIND, RUN_STATUS } from '@cryptoada/database';
import { z } from '@cryptoada/environment';
import { ENGINE_TIMEFRAME, RUN_PARAMETERS_SCHEMA } from '@cryptoada/strategy-engine';

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
});

export const RUN_WARNING_SCHEMA = z.strictObject({ code: z.string(), message: z.string() });

export const RUN_QUEUE_POSITION_SCHEMA = z.strictObject({
  own: z.number().int().min(1),
  overall: z.number().int().min(1),
});

export const RUN_DETAIL_SCHEMA = RUN_VIEW_SCHEMA.extend({
  warnings: z.array(RUN_WARNING_SCHEMA),
  queuePosition: RUN_QUEUE_POSITION_SCHEMA.nullable(),
});
