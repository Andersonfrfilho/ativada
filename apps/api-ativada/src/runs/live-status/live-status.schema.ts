// Copyright (c) 2026 Ada Technology. All rights reserved.
import { GOAL_RUN_OUTCOME, RUN_STATUS } from '@ativada/database';
import { z } from '@ativada/environment';
import {
  REGIME,
  RULE_KIND,
  SIGNAL_ACTION,
  TRIGGER_BASIS,
  TRIGGER_DIRECTION,
  TRIGGER_METRIC,
  TRIGGER_STATE,
} from '@ativada/strategy-engine';

import { decimalTextSchema, epochMillisecondsSchema } from '../../openapi/schema-primitives.js';
import {
  BUY_AND_HOLD_COMPARISON,
  DECISION_OUTCOME,
  TRIGGER_UNAVAILABLE_REASON,
} from './live-status.constant.js';

const voteSchema = z.union([z.literal(-1), z.literal(0), z.literal(1)]);
const nullableDecimal = decimalTextSchema.nullable();
const nullableInstant = epochMillisecondsSchema.nullable();

const DECISION_VOTE_SCHEMA = z.strictObject({
  ruleId: z.string(),
  label: z.string(),
  kind: z.enum(RULE_KIND),
  vote: voteSchema,
  weight: decimalTextSchema,
  isMissing: z.boolean(),
  // O que o indicador valia naquela vela: `{ value }` na saída única, uma chave por saída nas demais; `null` sem leitura.
  reading: z.record(z.string(), decimalTextSchema).nullable(),
});

export const DECISION_SCHEMA = z.strictObject({
  candleTime: epochMillisecondsSchema,
  closedAt: epochMillisecondsSchema,
  close: decimalTextSchema,
  action: z.enum(SIGNAL_ACTION),
  outcome: z.enum(DECISION_OUTCOME),
  score: decimalTextSchema,
  scoreThreshold: decimalTextSchema,
  regime: z.enum(REGIME),
  message: z.string(),
  technicalReason: z.string(),
  votes: z.array(DECISION_VOTE_SCHEMA),
});

const RULE_TRIGGER_SCHEMA = z.strictObject({
  ruleId: z.string(),
  label: z.string(),
  kind: z.enum(RULE_KIND),
  vote: voteSchema,
  weight: decimalTextSchema,
  isMet: z.boolean(),
  metric: z.enum(TRIGGER_METRIC),
  direction: z.enum(TRIGGER_DIRECTION),
  basis: z.enum(TRIGGER_BASIS),
  current: nullableDecimal,
  threshold: nullableDecimal,
  distance: nullableDecimal,
  distanceRate: nullableDecimal,
  message: z.string(),
});

const TRIGGERS_SCHEMA = z.discriminatedUnion('status', [
  z.strictObject({
    status: z.literal('available'),
    state: z.enum(TRIGGER_STATE),
    score: decimalTextSchema,
    scoreThreshold: decimalTextSchema,
    scoreGap: decimalTextSchema,
    message: z.string(),
    rules: z.array(RULE_TRIGGER_SCHEMA),
  }),
  z.strictObject({
    status: z.literal('unavailable'),
    reason: z.enum(TRIGGER_UNAVAILABLE_REASON),
    message: z.string(),
  }),
]);

const RUN_SECTION_SCHEMA = z.strictObject({
  id: z.string(),
  status: z.enum(RUN_STATUS),
  symbol: z.string(),
  timeframe: z.string(),
  periodStart: epochMillisecondsSchema,
  lastCandleTime: nullableInstant,
  lastDecisionAt: nullableInstant,
  nextDecisionAt: nullableInstant,
  waitingForData: z
    .strictObject({ since: epochMillisecondsSchema, openTime: epochMillisecondsSchema })
    .nullable(),
  stalledSince: epochMillisecondsSchema.optional(),
});

const BALANCE_SCHEMA = z.strictObject({
  initial: decimalTextSchema,
  current: decimalTextSchema,
  result: decimalTextSchema,
  resultRate: decimalTextSchema,
  observedAt: nullableInstant,
  message: z.string(),
});

const BUY_AND_HOLD_SCHEMA = z.strictObject({
  value: decimalTextSchema,
  resultRate: decimalTextSchema,
  differencePoints: decimalTextSchema,
  comparison: z.enum(BUY_AND_HOLD_COMPARISON),
  message: z.string(),
});

const GOAL_SCHEMA = z.strictObject({
  targetRate: decimalTextSchema,
  targetAmount: decimalTextSchema,
  remainingAmount: decimalTextSchema,
  remainingRate: decimalTextSchema,
  deadlineAt: epochMillisecondsSchema,
  remainingMilliseconds: epochMillisecondsSchema,
  maxLossRate: decimalTextSchema,
  floorAmount: decimalTextSchema,
  lossRoomAmount: decimalTextSchema,
  outcome: z.enum(GOAL_RUN_OUTCOME).nullable(),
  outcomeAt: nullableInstant,
  message: z.string(),
});

const OPEN_POSITION_SCHEMA = z.strictObject({
  entryPrice: decimalTextSchema,
  quantity: decimalTextSchema,
  targetPrice: decimalTextSchema,
  stopPrice: decimalTextSchema,
  openedCandleTime: epochMillisecondsSchema,
});

export const LIVE_STATUS_SCHEMA = z.strictObject({
  run: RUN_SECTION_SCHEMA,
  balance: BALANCE_SCHEMA,
  buyAndHold: BUY_AND_HOLD_SCHEMA.nullable(),
  goal: GOAL_SCHEMA.nullable(),
  openPosition: OPEN_POSITION_SCHEMA.nullable(),
  triggers: TRIGGERS_SCHEMA,
  decisions: z.strictObject({
    items: z.array(DECISION_SCHEMA),
    nextCursor: z.string().nullable(),
  }),
});
