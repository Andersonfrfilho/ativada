// Copyright (c) 2026 Ada Technology. All rights reserved.
import { MODEL_TEAM_REPORT_KIND, type TeamReportRow, type TeamScoreRow } from '@ativada/database';
import {
  buildGeneratedByFooter,
  isModelTeamKey,
  MODEL_TEAMS,
  ON_DEMAND_MARK,
  TEAM_BADGE,
  type ModelTeamKey,
} from '@ativada/model-agents';
import { z } from '@ativada/environment';
import { EngineDecimal, formatEngineDecimal } from '@ativada/strategy-engine';
import { judgeAgainstCoinFlip } from '@ativada/statistics';

import { MODEL_TEAM_SCOREBOARD_DAYS } from './model-team.constant.js';
import type { TeamProviderStatus } from './provider-state.js';
import type { RecommendationView, ScoreboardView, TeamView } from './model-team-view.schema.js';

const CANDLE_MILLISECONDS = 900_000;
const RATE_DECIMAL_PLACES = 4;

const rolesSchema = z.object({
  trend: z.object({ stance: z.string(), reason: z.string() }),
  risk: z.object({ level: z.string(), reason: z.string() }),
  decision: z.object({ reason: z.string() }),
});

export function toTeamView(params: {
  readonly teamKey: ModelTeamKey;
  readonly isEnabled: boolean;
  readonly provider: TeamProviderStatus;
}): TeamView {
  const team = MODEL_TEAMS[params.teamKey];
  return {
    teamKey: params.teamKey,
    displayName: team.displayName,
    provider: team.provider,
    modelFamily: team.modelFamily,
    cloudLabel: team.cloudLabel,
    isEnabled: params.isEnabled,
    providerStatus: params.provider,
  };
}

function toLevels(row: TeamReportRow): RecommendationView['levels'] {
  if (row.entryPrice === null || row.targetPrice === null || row.stopPrice === null) return null;
  return { entryPrice: row.entryPrice, targetPrice: row.targetPrice, stopPrice: row.stopPrice };
}

function toActionLabel(action: string | null): string | null {
  if (action === 'buy' || action === 'sell' || action === 'hold') return TEAM_BADGE[action].label;
  return null;
}

// A linha do banco como a tela a lê. `roles` e a ação são saída de modelo já higienizada, mas voltam validadas: o que não bate
// com o formato vira "sem papéis", nunca um erro na resposta.
export function toRecommendation(row: TeamReportRow): RecommendationView | undefined {
  if (!isModelTeamKey(row.teamKey)) return undefined;
  const roles = rolesSchema.safeParse(row.roles);
  const isOnDemand = row.kind === MODEL_TEAM_REPORT_KIND.ON_DEMAND;
  return {
    id: row.id,
    teamKey: row.teamKey,
    isOnDemand,
    onDemandMark: isOnDemand ? ON_DEMAND_MARK : null,
    candleTime: row.candleTime,
    closedAt: row.candleTime + CANDLE_MILLISECONDS,
    status: toStatus(row.status),
    failureCode: row.failureCode,
    action: toAction(row.action),
    actionLabel: toActionLabel(row.action),
    levels: toLevels(row),
    confidence: row.confidence,
    roles: roles.success ? parseRoles(roles.data) : null,
    isReasonHidden: row.isReasonHidden,
    generatedBy: buildGeneratedByFooter(row.teamKey),
    latencyMilliseconds: row.latencyMilliseconds,
    costUsd: row.costUsd,
    decidedAt: row.decidedAt?.toISOString() ?? null,
  };
}

function toStatus(status: string): RecommendationView['status'] {
  if (status === 'decided' || status === 'failed' || status === 'skipped') return status;
  return 'pending';
}

function toAction(action: string | null): RecommendationView['action'] {
  return action === 'buy' || action === 'sell' || action === 'hold' ? action : null;
}

function parseRoles(roles: z.infer<typeof rolesSchema>): RecommendationView['roles'] {
  const { trend, risk } = roles;
  const stance = trend.stance === 'up' || trend.stance === 'down' ? trend.stance : 'neutral';
  const level = risk.level === 'low' || risk.level === 'high' ? risk.level : 'medium';
  return {
    trend: { stance, reason: trend.reason },
    risk: { level, reason: risk.reason },
    decision: { reason: roles.decision.reason },
  };
}

function toHitRate(hits: number, counted: number): string | null {
  if (counted === 0) return null;
  const rate = new EngineDecimal(hits).dividedBy(counted);
  return formatEngineDecimal(rate.toDecimalPlaces(RATE_DECIMAL_PLACES, EngineDecimal.ROUND_FLOOR));
}

// O placar: acerto de LADO contra a moeda ao ar, pelo Wilson de `@ativada/statistics` (o único lugar). Empate não conta.
export function toScoreboard(row: TeamScoreRow | undefined): ScoreboardView {
  const hits = row?.hits ?? 0;
  const misses = row?.misses ?? 0;
  const counted = hits + misses;
  const judgement = judgeAgainstCoinFlip({ hits, counted });
  return {
    hits,
    misses,
    ties: row?.ties ?? 0,
    counted,
    hitRate: toHitRate(hits, counted),
    verdict: judgement.verdict,
    lower: judgement.lower,
    upper: judgement.upper,
    sinceDays: MODEL_TEAM_SCOREBOARD_DAYS,
  };
}
