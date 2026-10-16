// Copyright (c) 2026 Ada Technology. All rights reserved.
import { z } from '@ativada/environment';
import { ANALYST_VERSION, ENTRY_GATE, POSTURE } from '@ativada/risk-analyst';

import { decimalTextSchema, epochMillisecondsSchema } from '../../openapi/schema-primitives.js';
import {
  CADENCE_SCHEMA,
  COMMAND_SCHEMA,
  FORECAST_SCHEMA,
  READINGS_SCHEMA,
  STORED_LOCK_SCHEMA,
  STORED_SPECIALIST_SCHEMA,
} from './analyst-blocks.schema.js';
import {
  ANALYST_DECISION_STATUS,
  ANALYST_MODE,
  ANALYST_UNAVAILABLE_REASON,
} from './analyst.constant.js';

const nullableText = z.string().nullable();

const SPECIALIST_VIEW_SCHEMA = z.strictObject({
  ...STORED_SPECIALIST_SCHEMA.shape,
  label: z.string(),
  voteLabel: z.string(),
  accuracyText: z.string(),
  verdictLabel: z.string(),
  weightText: z.string(),
  // Qual regra dele decidiu o voto, em frase do catálogo fechado; `null` na linha da estratégia e em decisão antiga.
  motive: z.string().nullable(),
});

const LOCK_VIEW_SCHEMA = z.strictObject({
  ...STORED_LOCK_SCHEMA.shape,
  // A linha da trava sempre mostrada e, só na trava ativa, a frase do motivo.
  line: z.string(),
  message: nullableText,
});

const DECIDED_VIEW_SCHEMA = z.strictObject({
  status: z.literal(ANALYST_DECISION_STATUS.DECIDED),
  candleTime: epochMillisecondsSchema,
  closedAt: epochMillisecondsSchema,
  posture: z.enum(POSTURE),
  postureLabel: z.string(),
  cadenceMinutes: CADENCE_SCHEMA,
  isOnCadence: z.boolean(),
  entryGate: z.enum(ENTRY_GATE),
  riskScale: decimalTextSchema,
  maxTradeMinutes: z.number().int().positive(),
  timeExitDue: z.boolean(),
  forecast: FORECAST_SCHEMA,
  specialists: z.array(SPECIALIST_VIEW_SCHEMA),
  readings: READINGS_SCHEMA,
  commands: z.array(COMMAND_SCHEMA),
  isShadow: z.boolean(),
  message: z.string(),
  reasonMessage: z.string(),
  cadenceLine: nullableText,
  offCadenceMessage: nullableText,
  timeExitMessage: nullableText,
  lockMessages: z.array(z.string()),
  locks: z.array(LOCK_VIEW_SCHEMA),
  disclaimer: z.string(),
});

const FAILED_VIEW_SCHEMA = z.strictObject({
  status: z.literal(ANALYST_DECISION_STATUS.FAILED),
  candleTime: epochMillisecondsSchema,
  closedAt: epochMillisecondsSchema,
  isShadow: z.boolean(),
  message: z.string(),
  failureCode: nullableText,
  disclaimer: z.string(),
});

const UNAVAILABLE_SCHEMA = z.strictObject({
  status: z.literal('unavailable'),
  reason: z.enum(ANALYST_UNAVAILABLE_REASON),
  message: z.string(),
});

const GOAL_PROGRESS_SCHEMA = z.strictObject({
  targetRate: decimalTextSchema,
  summedRate: decimalTextSchema,
  remainingRate: decimalTextSchema,
  trades: z.number().int().nonnegative(),
  message: z.string(),
});

// Uma linha do histórico: decidida ou falha (a vela em que o analista não conseguiu decidir).
export const ANALYST_DECISION_ITEM_SCHEMA = z.discriminatedUnion('status', [
  DECIDED_VIEW_SCHEMA,
  FAILED_VIEW_SCHEMA,
]);

export const ANALYST_SCHEMA = z.strictObject({
  version: z.literal(ANALYST_VERSION),
  mode: z.enum(ANALYST_MODE),
  modeMessage: z.string(),
  current: z.union([DECIDED_VIEW_SCHEMA, UNAVAILABLE_SCHEMA]),
  goalProgress: GOAL_PROGRESS_SCHEMA.nullable(),
  locks: z.array(LOCK_VIEW_SCHEMA),
});

export type AnalystDecisionView = z.infer<typeof ANALYST_DECISION_ITEM_SCHEMA>;
export type DecidedAnalystView = z.infer<typeof DECIDED_VIEW_SCHEMA>;
export type SpecialistViewRow = z.infer<typeof SPECIALIST_VIEW_SCHEMA>;
export type AnalystLockView = z.infer<typeof LOCK_VIEW_SCHEMA>;
export type AnalystView = z.infer<typeof ANALYST_SCHEMA>;
export type AnalystGoalProgressView = z.infer<typeof GOAL_PROGRESS_SCHEMA>;
