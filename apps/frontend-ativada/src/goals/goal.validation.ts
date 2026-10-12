// Copyright (c) 2026 Ada Technology. All rights reserved.
import { z } from '@ativada/environment';
import { decimalText, nullableDecimalText } from '../http/decimal.validation.js';

export const goalSchema = z.object({
  id: z.string(),
  symbol: z.string(),
  targetRate: decimalText,
  horizonDays: z.number(),
  maxLossRate: decimalText,
  isActive: z.boolean(),
  createdAt: z.string(),
});

const ruleTriggerSchema = z.object({
  ruleId: z.string(),
  family: z.string(),
  isMet: z.boolean(),
  metric: z.string(),
  direction: z.enum(['above', 'below']),
  basis: z.enum(['exact', 'indicative']),
  current: nullableDecimalText,
  threshold: nullableDecimalText,
  distance: nullableDecimalText,
  distanceRate: nullableDecimalText,
});

const situationSchema = z.object({
  signal: z.object({ action: z.string(), score: decimalText, reason: z.string() }),
  triggers: z.object({
    state: z.enum(['awaiting_entry', 'holding']),
    scoreThreshold: decimalText,
    scoreGap: decimalText,
    rules: z.array(ruleTriggerSchema),
  }),
});

const evaluationSchema = z.object({
  windowCount: z.number(),
  reachRate: nullableDecimalText,
  stopRate: nullableDecimalText,
  medianDaysToTarget: nullableDecimalText,
  benchmark: z.object({ reachRate: nullableDecimalText, stopRate: nullableDecimalText }),
  verdict: z.string(),
});

export const combinationSchema = z.object({
  rank: z.number(),
  strategy: z.object({
    id: z.string(),
    name: z.string(),
    versionId: z.string(),
    version: z.number(),
  }),
  symbol: z.string(),
  isGoalSymbol: z.boolean(),
  evaluation: evaluationSchema,
  situation: situationSchema.nullable(),
});

export const goalEvaluationSchema = z.object({
  combinations: z.array(combinationSchema),
  unavailable: z.array(
    z.object({ strategyId: z.string(), symbol: z.string(), reason: z.string() }),
  ),
});

export type Goal = z.infer<typeof goalSchema>;
export type Combination = z.infer<typeof combinationSchema>;
export type GoalEvaluation = z.infer<typeof goalEvaluationSchema>;
export type Situation = NonNullable<Combination['situation']>;
export type RuleTrigger = Situation['triggers']['rules'][number];
