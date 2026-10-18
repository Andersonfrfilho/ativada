// Copyright (c) 2026 Ada Technology. All rights reserved.
import { z } from '@ativada/environment';

import { decimalText } from '../../http/decimal.validation.js';
import {
  MODEL_PROVIDERS,
  MODEL_TEAM_KEYS,
  NEXT_MOVES,
  PROVIDER_STATES,
  RECOMMENDATION_STATUSES,
  TEAM_ACTIONS,
  VERDICTS,
} from './model-teams.constant.js';

// Espelho de `GET /v1/me/model-teams` e `GET /v1/runs/:runId/model-teams` (spec 015, RF22). Dinheiro e preço são texto decimal:
// nunca passam por `Number`.
const teamKey = z.enum(MODEL_TEAM_KEYS);
const instant = z.number();

// De quem a execução segue as decisões (`runs.request.signalSource`): `null`/ausente = execução de regras.
export const signalSourceSchema = z.object({ kind: z.literal('model_team'), team: teamKey });

export const providerStatusSchema = z.object({
  state: z.enum(PROVIDER_STATES).nullable(),
  keyConfigured: z.boolean(),
  modelConfigured: z.boolean(),
  circuitUntil: z.string().nullable(),
  message: z.string(),
  isAvailable: z.boolean(),
});

export const teamViewSchema = z.object({
  teamKey,
  displayName: z.string(),
  provider: z.enum(MODEL_PROVIDERS),
  modelFamily: z.string(),
  cloudLabel: z.string(),
  isEnabled: z.boolean(),
  providerStatus: providerStatusSchema,
});

export const myModelTeamsSchema = z.object({ notice: z.string(), teams: z.array(teamViewSchema) });

const rolesSchema = z.object({
  trend: z.object({ stance: z.enum(['up', 'down', 'neutral']), reason: z.string() }),
  risk: z.object({ level: z.enum(['low', 'medium', 'high']), reason: z.string() }),
  decision: z.object({ reason: z.string() }),
});

export const recommendationSchema = z.object({
  id: z.string(),
  teamKey,
  isOnDemand: z.boolean(),
  onDemandMark: z.string().nullable(),
  candleTime: instant,
  closedAt: instant,
  status: z.enum(RECOMMENDATION_STATUSES),
  failureCode: z.string().nullable(),
  action: z.enum(TEAM_ACTIONS).nullable(),
  actionLabel: z.string().nullable(),
  levels: z
    .object({ entryPrice: decimalText, targetPrice: decimalText, stopPrice: decimalText })
    .nullable(),
  confidence: z.number().nullable(),
  roles: rolesSchema.nullable(),
  isReasonHidden: z.boolean(),
  generatedBy: z.string(),
  latencyMilliseconds: z.number().nullable(),
  costUsd: decimalText,
  decidedAt: z.string().nullable(),
});

export const scoreboardSchema = z.object({
  hits: z.number(),
  misses: z.number(),
  ties: z.number(),
  counted: z.number(),
  hitRate: decimalText.nullable(),
  verdict: z.enum(VERDICTS),
  lower: decimalText.nullable(),
  upper: decimalText.nullable(),
  sinceDays: z.number(),
});

const costSchema = z.object({ todayUsd: decimalText, monthUsd: decimalText });

const teamStateSchema = z.object({
  team: teamViewSchema,
  recent: z.array(recommendationSchema),
  onDemand: z.array(recommendationSchema),
  scoreboard: scoreboardSchema,
  cost: costSchema,
  failures: z.object({ hours: z.number(), total: z.number(), failed: z.number() }),
});

export const runModelTeamsSchema = z.object({
  symbol: z.string(),
  signalSource: signalSourceSchema.nullable(),
  notice: z.string(),
  costNotice: z.string(),
  comparisonNotice: z.string(),
  teams: z.array(teamStateSchema),
  totalCost: costSchema,
});

const ruleRowSchema = z.object({
  key: z.string(),
  vote: z.number().nullable(),
  isHit: z.boolean().nullable(),
});

const teamRowSchema = z.object({
  teamKey,
  status: z.enum(RECOMMENDATION_STATUSES).nullable(),
  action: z.enum(TEAM_ACTIONS).nullable(),
  isHit: z.boolean().nullable(),
});

export const comparisonItemSchema = z.object({
  candleTime: instant,
  closedAt: instant,
  close: decimalText,
  next: z.enum(NEXT_MOVES),
  nextClose: decimalText.nullable(),
  rules: z.array(ruleRowSchema).nullable(),
  teams: z.array(teamRowSchema),
});

export const opinionRequestedSchema = z.object({ opinionId: z.string() });

export type TeamView = z.infer<typeof teamViewSchema>;
export type MyModelTeams = z.infer<typeof myModelTeamsSchema>;
export type Recommendation = z.infer<typeof recommendationSchema>;
export type Scoreboard = z.infer<typeof scoreboardSchema>;
export type TeamState = z.infer<typeof teamStateSchema>;
export type RunModelTeams = z.infer<typeof runModelTeamsSchema>;
export type ComparisonItem = z.infer<typeof comparisonItemSchema>;
