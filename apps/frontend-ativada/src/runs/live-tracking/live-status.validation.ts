// Copyright (c) 2026 Ada Technology. All rights reserved.
import { z } from '@ativada/environment';

import { decimalText } from '../../http/decimal.validation.js';

// Espelho de `GET /v1/runs/:runId/live-status` e `/decisions` (ADR 0002, spec 008, L4 a L13): valor fora do contrato reprova e nada é desenhado.
const instant = z.number();
const nullableInstant = instant.nullable();
const nullableDecimal = decimalText.nullable();
const vote = z.union([z.literal(-1), z.literal(0), z.literal(1)]);

const decisionVoteSchema = z.object({
  ruleId: z.string(),
  label: z.string(),
  kind: z.string(),
  vote,
  weight: decimalText,
  isMissing: z.boolean(),
  reading: z.record(z.string(), decimalText).nullable(),
});

export const decisionSchema = z.object({
  candleTime: instant,
  closedAt: instant,
  close: decimalText,
  action: z.enum(['BUY', 'SELL', 'HOLD']),
  outcome: z.enum(['waited', 'bought', 'sold']),
  score: decimalText,
  scoreThreshold: decimalText,
  regime: z.enum(['trending', 'ranging', 'none']),
  message: z.string(),
  technicalReason: z.string(),
  votes: z.array(decisionVoteSchema),
});

const ruleTriggerSchema = z.object({
  ruleId: z.string(),
  label: z.string(),
  kind: z.string(),
  vote,
  weight: decimalText,
  isMet: z.boolean(),
  metric: z.enum(['close_price', 'rsi', 'macd_gap', 'obv_gap', 'fear_greed_index']),
  direction: z.enum(['above', 'below']),
  basis: z.enum(['exact', 'indicative']),
  current: nullableDecimal,
  threshold: nullableDecimal,
  distance: nullableDecimal,
  distanceRate: nullableDecimal,
  message: z.string(),
});

const triggersSchema = z.discriminatedUnion('status', [
  z.object({
    status: z.literal('available'),
    state: z.enum(['awaiting_entry', 'holding']),
    score: decimalText,
    scoreThreshold: decimalText,
    scoreGap: decimalText,
    message: z.string(),
    rules: z.array(ruleTriggerSchema),
  }),
  z.object({
    status: z.literal('unavailable'),
    reason: z.enum(['not_running', 'no_candle', 'warming_up']),
    message: z.string(),
  }),
]);

const runSectionSchema = z.object({
  id: z.string(),
  status: z.string(),
  symbol: z.string(),
  timeframe: z.string(),
  periodStart: instant,
  lastCandleTime: nullableInstant,
  lastDecisionAt: nullableInstant,
  nextDecisionAt: nullableInstant,
  waitingForData: z.object({ since: instant, openTime: instant }).nullable(),
  stalledSince: instant.optional(),
});

const balanceSchema = z.object({
  initial: decimalText,
  current: decimalText,
  result: decimalText,
  resultRate: decimalText,
  observedAt: nullableInstant,
  message: z.string(),
});

const buyAndHoldSchema = z.object({
  value: decimalText,
  resultRate: decimalText,
  differencePoints: decimalText,
  comparison: z.enum(['above', 'below', 'even']),
  message: z.string(),
});

const goalSchema = z.object({
  targetRate: decimalText,
  targetAmount: decimalText,
  remainingAmount: decimalText,
  remainingRate: decimalText,
  deadlineAt: instant,
  remainingMilliseconds: instant,
  maxLossRate: decimalText,
  floorAmount: decimalText,
  lossRoomAmount: decimalText,
  outcome: z.enum(['goal_reached', 'goal_stopped', 'goal_expired']).nullable(),
  outcomeAt: nullableInstant,
  message: z.string(),
});

const openPositionSchema = z.object({
  entryPrice: decimalText,
  quantity: decimalText,
  targetPrice: decimalText,
  stopPrice: decimalText,
  openedCandleTime: instant,
});

export const liveStatusSchema = z.object({
  run: runSectionSchema,
  balance: balanceSchema,
  buyAndHold: buyAndHoldSchema.nullable(),
  goal: goalSchema.nullable(),
  openPosition: openPositionSchema.nullable(),
  triggers: triggersSchema,
  decisions: z.object({ items: z.array(decisionSchema), nextCursor: z.string().nullable() }),
});

export type Decision = z.infer<typeof decisionSchema>;
export type DecisionVote = z.infer<typeof decisionVoteSchema>;
export type RuleTrigger = z.infer<typeof ruleTriggerSchema>;
export type LiveGoal = z.infer<typeof goalSchema>;
export type LiveStatus = z.infer<typeof liveStatusSchema>;
