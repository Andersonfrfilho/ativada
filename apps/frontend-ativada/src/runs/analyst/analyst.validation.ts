// Copyright (c) 2026 Ada Technology. All rights reserved.
import { z } from '@ativada/environment';

import { decimalText } from '../../http/decimal.validation.js';

// Espelho de `GET /v1/runs/:runId/analyst` e `/analyst/decisions` (ADR 0002, spec 007, A20): valor fora do contrato reprova e nada
// é desenhado. O painel não importa código de outra app: os vocabulários fechados são repetidos aqui.
const instant = z.number();
const nullableDecimal = decimalText.nullable();
const nullableText = z.string().nullable();
const count = z.number().int().nonnegative();
const vote = z.union([z.literal(-1), z.literal(0), z.literal(1)]);

export const ANALYST_POSTURE = ['pause', 'caution', 'normal', 'confident'] as const;
export const ANALYST_UNAVAILABLE_REASON = [
  'not_running',
  'stalled',
  'waiting_for_data',
  'no_candle',
  'warming_up',
  'failed',
] as const;

const forecastSchema = z.object({
  side: z.enum(['up', 'down']).nullable(),
  strength: z.enum(['weak', 'firm']).nullable(),
  noForecastReason: z
    .enum(['no_data', 'too_volatile', 'no_proven_specialist', 'proven_neutral', 'split_team'])
    .nullable(),
  forWeight: decimalText,
  againstWeight: decimalText,
  provenWeight: decimalText,
});

const readingsSchema = z.object({
  relativeVolume: nullableDecimal,
  atrRate: nullableDecimal,
  atrPercentile90: nullableDecimal,
  atrPercentile95: nullableDecimal,
  momentumShort: nullableDecimal,
  momentumLong: nullableDecimal,
  roundTripCost: decimalText,
  moveToCost: nullableDecimal,
});

const commandSchema = z.object({
  commandId: z.string(),
  kind: z.enum(['halt', 'resume', 'exit_position']),
  reason: z.string(),
});

export const lockSchema = z.object({
  key: z.enum(['daily_loss', 'loss_streak', 'trade_count', 'goal_room', 'move_cost']),
  current: nullableDecimal,
  limit: decimalText,
  isActive: z.boolean(),
  isApplicable: z.boolean(),
  line: z.string(),
  message: nullableText,
});

export const specialistSchema = z.object({
  key: z.enum(['trend', 'reversion', 'volume', 'sentiment', 'strategy']),
  vote: vote.nullable(),
  isUnread: z.boolean(),
  predictions: count,
  counted: count,
  hits: count,
  misses: count,
  ties: count,
  upMoves: count,
  hitRate: nullableDecimal,
  upRate: nullableDecimal,
  verdict: z.enum(['above', 'even', 'below', 'too_few']),
  lower: nullableDecimal,
  upper: nullableDecimal,
  weight: decimalText,
  label: z.string(),
  voteLabel: z.string(),
  accuracyText: z.string(),
  verdictLabel: z.string(),
  weightText: z.string(),
  motive: nullableText,
});

const decidedSchema = z.object({
  status: z.literal('decided'),
  candleTime: instant,
  closedAt: instant,
  posture: z.enum(ANALYST_POSTURE),
  postureLabel: z.string(),
  cadenceMinutes: z.union([z.literal(15), z.literal(60), z.literal(240)]),
  isOnCadence: z.boolean(),
  entryGate: z.enum(['open', 'closed']),
  riskScale: decimalText,
  maxTradeMinutes: z.number().int().positive(),
  timeExitDue: z.boolean(),
  forecast: forecastSchema,
  specialists: z.array(specialistSchema),
  readings: readingsSchema,
  commands: z.array(commandSchema),
  isShadow: z.boolean(),
  message: z.string(),
  reasonMessage: z.string(),
  cadenceLine: nullableText,
  offCadenceMessage: nullableText,
  timeExitMessage: nullableText,
  lockMessages: z.array(z.string()),
  locks: z.array(lockSchema),
  disclaimer: z.string(),
});

const failedSchema = z.object({
  status: z.literal('failed'),
  candleTime: instant,
  closedAt: instant,
  isShadow: z.boolean(),
  message: z.string(),
  failureCode: nullableText,
  disclaimer: z.string(),
});

const unavailableSchema = z.object({
  status: z.literal('unavailable'),
  reason: z.enum(ANALYST_UNAVAILABLE_REASON),
  message: z.string(),
});

const goalProgressSchema = z.object({
  targetRate: decimalText,
  summedRate: decimalText,
  remainingRate: decimalText,
  trades: count,
  message: z.string(),
});

export const analystDecisionSchema = z.discriminatedUnion('status', [decidedSchema, failedSchema]);

export const analystSchema = z.object({
  version: z.string(),
  mode: z.enum(['shadow', 'govern']),
  modeMessage: z.string(),
  current: z.discriminatedUnion('status', [decidedSchema, unavailableSchema]),
  goalProgress: goalProgressSchema.nullable(),
  locks: z.array(lockSchema),
});

export type Analyst = z.infer<typeof analystSchema>;
export type AnalystDecision = z.infer<typeof analystDecisionSchema>;
export type DecidedAnalystDecision = z.infer<typeof decidedSchema>;
export type AnalystSpecialist = z.infer<typeof specialistSchema>;
export type AnalystLock = z.infer<typeof lockSchema>;
export type AnalystGoalProgress = z.infer<typeof goalProgressSchema>;
export type AnalystPosture = (typeof ANALYST_POSTURE)[number];
