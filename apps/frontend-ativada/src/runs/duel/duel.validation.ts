// Copyright (c) 2026 Ada Technology. All rights reserved.
import { z } from '@ativada/environment';

import { decimalText } from '../../http/decimal.validation.js';
import { MODEL_TEAM_KEYS } from '../model-teams/model-teams.constant.js';
import { scoreboardSchema } from '../model-teams/model-teams.validation.js';

// Espelho de `POST /v1/model-duels` e `GET /v1/model-duels/:duelId` (spec 015, RF13 e RF21).
const teamKey = z.enum(MODEL_TEAM_KEYS);

const duelRunSchema = z.object({
  runId: z.string(),
  team: teamKey.nullable(),
  signalSource: z.object({ kind: z.literal('model_team'), team: teamKey }).nullable(),
  status: z.string(),
  lastCandleTime: z.number().nullable(),
  createdAt: z.string(),
});

export const createdDuelSchema = z.object({
  duelId: z.string(),
  symbol: z.string(),
  timeframe: z.string(),
  runs: z.array(duelRunSchema),
});

const curveSchema = z.object({ runId: z.string(), equity: z.array(decimalText.nullable()) });

const rankingRowSchema = z.object({
  runId: z.string(),
  team: teamKey.nullable(),
  returnRate: decimalText.nullable(),
  maxDrawdown: decimalText.nullable(),
  trades: z.number(),
  scoreboard: scoreboardSchema.nullable(),
  apiCost: z.object({ todayUsd: decimalText, monthUsd: decimalText }).nullable(),
});

export const duelSchema = z
  .object({
    duelId: z.string(),
    symbol: z.string(),
    notice: z.string(),
    comparisonNotice: z.string(),
    runs: z.array(duelRunSchema),
    candleTimes: z.array(z.number()),
    curves: z.array(curveSchema),
    ranking: z.array(rankingRowSchema),
  })
  .refine((duel) => duel.curves.every((curve) => curve.equity.length === duel.candleTimes.length));

export type CreatedDuel = z.infer<typeof createdDuelSchema>;
export type Duel = z.infer<typeof duelSchema>;
export type DuelRun = z.infer<typeof duelRunSchema>;
export type DuelRankingRow = z.infer<typeof rankingRowSchema>;

export type CreateDuelBody = {
  readonly symbol: string;
  readonly startingBalance: string;
  readonly teams: readonly string[];
  readonly withMyStrategy?: { readonly strategyVersionId: string };
};
