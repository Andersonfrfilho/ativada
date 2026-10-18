// Copyright (c) 2026 Ada Technology. All rights reserved.
import { hasKnownSymbolFilters } from '@ativada/market-data-crypto';
import { z } from '@ativada/environment';
import { MODEL_TEAM_KEYS, SIGNAL_SOURCE_KIND, type ModelTeamKey } from '@ativada/model-agents';
import { type RunSetup } from '@ativada/strategy-engine';

import type { EnabledMarkets } from '../markets/candles-query.schema.js';
import {
  decimalTextSchema,
  epochMillisecondsSchema,
  isoDateTimeSchema,
  resourceIdSchema,
} from '../openapi/schema-primitives.js';
import { buildSetup, runSetupInput, TEXT_MAXIMUM } from '../runs/create-run-setup.js';
import { RUN_REASON } from '../runs/runs.constant.js';
import { addIssue } from '../runs/create-run-setup.js';
import { SCOREBOARD_SCHEMA } from './model-team-view.schema.js';
import { DUEL_FIELD, DUEL_MAX_TEAMS, DUEL_REASON } from './model-team.constant.js';

const DUEL_TIMEFRAME = '15m';

export type CreateModelDuelBody = {
  readonly setup: RunSetup;
  readonly teams: readonly ModelTeamKey[];
  readonly myStrategyVersionId: string | undefined;
};

function isEnabledSymbol(enabled: EnabledMarkets): (value: string) => boolean {
  return (value) => enabled.symbols.includes(value) && hasKnownSymbolFilters(value);
}

// `POST /v1/model-duels` (RF13): um par, UM saldo fictício e as equipes escolhidas, mais (se quiser) a estratégia de regras do
// próprio usuário. O saldo é conferido pelo esquema do MOTOR (o mesmo de `runParameters.initialBalance`); a vela é sempre de 15 min.
export function createModelDuelBodySchema(enabled: EnabledMarkets): z.ZodType<CreateModelDuelBody> {
  return z
    .strictObject({
      symbol: z.string().refine(isEnabledSymbol(enabled), { error: RUN_REASON.NOT_ENABLED }),
      startingBalance: z.string().max(TEXT_MAXIMUM),
      teams: z.array(z.enum(MODEL_TEAM_KEYS)).min(1).max(DUEL_MAX_TEAMS),
      withMyStrategy: z.strictObject({ strategyVersionId: resourceIdSchema }).optional(),
    })
    .transform((body, context): CreateModelDuelBody => {
      if (new Set(body.teams).size !== body.teams.length) {
        addIssue(context, [DUEL_FIELD.TEAMS], DUEL_REASON.DUPLICATE_TEAM);
      }
      const setup = buildSetup(
        runSetupInput(body.symbol, DUEL_TIMEFRAME, { initialBalance: body.startingBalance }),
        context,
      );
      if (setup === undefined) return z.NEVER;
      return {
        setup,
        teams: body.teams,
        myStrategyVersionId: body.withMyStrategy?.strategyVersionId,
      };
    });
}

const DUEL_RUN_SCHEMA = z.strictObject({
  runId: resourceIdSchema,
  // De qual equipe é a execução; `null` na execução da estratégia de regras do usuário.
  team: z.enum(MODEL_TEAM_KEYS).nullable(),
  signalSource: z
    .strictObject({ kind: z.literal(SIGNAL_SOURCE_KIND.MODEL_TEAM), team: z.enum(MODEL_TEAM_KEYS) })
    .nullable(),
  status: z.string(),
  lastCandleTime: epochMillisecondsSchema.nullable(),
  createdAt: isoDateTimeSchema,
});

export const CREATE_MODEL_DUEL_SCHEMA = z.strictObject({
  duelId: resourceIdSchema,
  symbol: z.string(),
  timeframe: z.literal(DUEL_TIMEFRAME),
  runs: z.array(DUEL_RUN_SCHEMA),
});

const CURVE_SCHEMA = z.strictObject({
  runId: resourceIdSchema,
  // Uma posição por `candleTimes`; `null` onde a execução ainda não tem ponto.
  equity: z.array(decimalTextSchema.nullable()),
});

const RANKING_ROW_SCHEMA = z.strictObject({
  runId: resourceIdSchema,
  team: z.enum(MODEL_TEAM_KEYS).nullable(),
  // Retorno do patrimônio sobre o saldo inicial (para baixo) e perda máxima na mínima (para cima), a 8 casas.
  returnRate: decimalTextSchema.nullable(),
  maxDrawdown: decimalTextSchema.nullable(),
  trades: z.number().int().nonnegative(),
  // O acerto de lado da equipe no par (Wilson); `null` na execução de regras.
  scoreboard: SCOREBOARD_SCHEMA.nullable(),
  // Custo de API da equipe hoje e no mês (estimativa pelos tokens); `null` na execução de regras.
  apiCost: z.strictObject({ todayUsd: decimalTextSchema, monthUsd: decimalTextSchema }).nullable(),
});

export const MODEL_DUEL_SCHEMA = z.strictObject({
  duelId: resourceIdSchema,
  symbol: z.string(),
  notice: z.string(),
  comparisonNotice: z.string(),
  runs: z.array(DUEL_RUN_SCHEMA),
  candleTimes: z.array(epochMillisecondsSchema),
  curves: z.array(CURVE_SCHEMA),
  ranking: z.array(RANKING_ROW_SCHEMA),
});

export type ModelDuelView = z.infer<typeof MODEL_DUEL_SCHEMA>;
export type CreatedModelDuelView = z.infer<typeof CREATE_MODEL_DUEL_SCHEMA>;
export type DuelRunView = z.infer<typeof DUEL_RUN_SCHEMA>;
export type DuelRankingRow = z.infer<typeof RANKING_ROW_SCHEMA>;
