// Copyright (c) 2026 Ada Technology. All rights reserved.
import { z } from '@ativada/environment';
import {
  MODEL_PROVIDER,
  MODEL_TEAM_KEYS,
  PROVIDER_STATE,
  REPORT_CONFIDENCE_MAX,
  RISK_LEVEL,
  TEAM_ACTION,
  TREND_STANCE,
} from '@ativada/model-agents';
import { COIN_FLIP_VERDICT } from '@ativada/statistics';

import {
  decimalTextSchema,
  epochMillisecondsSchema,
  isoDateTimeSchema,
  resourceIdSchema,
} from '../openapi/schema-primitives.js';

const nullableText = z.string().nullable();

export const PROVIDER_STATUS_SCHEMA = z.strictObject({
  state: z.enum(Object.values(PROVIDER_STATE)).nullable(),
  keyConfigured: z.boolean(),
  modelConfigured: z.boolean(),
  circuitUntil: nullableText,
  message: z.string(),
  isAvailable: z.boolean(),
});

// A ficha da equipe: catálogo fechado (nome, provedor, nuvem), o interruptor do dono e o estado do provedor pelo batimento.
export const TEAM_VIEW_SCHEMA = z.strictObject({
  teamKey: z.enum(MODEL_TEAM_KEYS),
  displayName: z.string(),
  provider: z.enum(Object.values(MODEL_PROVIDER)),
  modelFamily: z.string(),
  cloudLabel: z.string(),
  isEnabled: z.boolean(),
  providerStatus: PROVIDER_STATUS_SCHEMA,
});

const ROLES_SCHEMA = z.strictObject({
  trend: z.strictObject({
    stance: z.enum(Object.values(TREND_STANCE)),
    reason: z.string(),
  }),
  risk: z.strictObject({ level: z.enum(Object.values(RISK_LEVEL)), reason: z.string() }),
  decision: z.strictObject({ reason: z.string() }),
});

const LEVELS_SCHEMA = z.strictObject({
  entryPrice: decimalTextSchema,
  targetPrice: decimalTextSchema,
  stopPrice: decimalTextSchema,
});

export const RECOMMENDATION_STATUS = ['decided', 'failed', 'skipped', 'pending'] as const;

// Uma recomendação gravada: a ação, os níveis (exibidos e medidos, não comandam a ordem), os três papéis e o rodapé de "gerado
// por modelo". O motivo já passou pela higiene do worker; o que ela ocultou vem com `isReasonHidden`.
export const RECOMMENDATION_SCHEMA = z.strictObject({
  id: resourceIdSchema,
  teamKey: z.enum(MODEL_TEAM_KEYS),
  isOnDemand: z.boolean(),
  onDemandMark: nullableText,
  candleTime: epochMillisecondsSchema,
  closedAt: epochMillisecondsSchema,
  status: z.enum(RECOMMENDATION_STATUS),
  failureCode: nullableText,
  action: z.enum(Object.values(TEAM_ACTION)).nullable(),
  actionLabel: nullableText,
  levels: LEVELS_SCHEMA.nullable(),
  confidence: z.number().int().min(0).max(REPORT_CONFIDENCE_MAX).nullable(),
  roles: ROLES_SCHEMA.nullable(),
  isReasonHidden: z.boolean(),
  generatedBy: z.string(),
  latencyMilliseconds: z.number().int().nonnegative().nullable(),
  costUsd: decimalTextSchema,
  decidedAt: isoDateTimeSchema.nullable(),
});

export const SCOREBOARD_SCHEMA = z.strictObject({
  hits: z.number().int().nonnegative(),
  misses: z.number().int().nonnegative(),
  ties: z.number().int().nonnegative(),
  counted: z.number().int().nonnegative(),
  hitRate: decimalTextSchema.nullable(),
  verdict: z.enum(Object.values(COIN_FLIP_VERDICT)),
  lower: decimalTextSchema.nullable(),
  upper: decimalTextSchema.nullable(),
  sinceDays: z.number().int().positive(),
});

export type ProviderStatusView = z.infer<typeof PROVIDER_STATUS_SCHEMA>;
export type TeamView = z.infer<typeof TEAM_VIEW_SCHEMA>;
export type RecommendationView = z.infer<typeof RECOMMENDATION_SCHEMA>;
export type ScoreboardView = z.infer<typeof SCOREBOARD_SCHEMA>;
