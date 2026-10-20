// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { ModelTeamReadRepository, RunRecord } from '@ativada/database';
import { MODEL_TEAM_KEYS, type ModelTeamKey } from '@ativada/model-agents';

import { computeLiveBalance } from '../live-status/live-balance.js';
import {
  MODEL_TEAM_FAILURE_HOURS,
  MODEL_TEAM_SCOREBOARD_DAYS,
} from '../../model-teams/model-team.constant.js';
import type { PlanBasis } from './trade-plan-levels.js';
import { buildTeamPlan } from './trade-plan-teams.js';
import type { TeamPlanView, TeamWalletView } from './trade-plan-view.js';
import { TRADE_PLAN_TEAM_REPORTS } from './trade-plan.constant.js';

export type PlanTeamsParams = {
  readonly reports: Pick<ModelTeamReadRepository, 'readOverview'>;
  readonly exchange: string;
  readonly run: RunRecord;
  readonly basis: PlanBasis;
  // As equipes que o DONO ligou: desligada não aparece (nem lida).
  readonly enabled: readonly string[];
  readonly latestEquity: string | undefined;
  // A equipe que decide esta execução (`signalSource`); ausente na execução de estratégia.
  readonly signalTeam: ModelTeamKey | undefined;
};

// A carteira da equipe é a própria execução de equipe: saldo e resultado desde o início, como o acompanhamento.
function walletOf(params: PlanTeamsParams, teamKey: ModelTeamKey): TeamWalletView | null {
  if (params.signalTeam !== teamKey) return null;
  const balance = computeLiveBalance({
    initial: params.basis.parameters.initialBalance,
    latestEquity: params.latestEquity,
  });
  return { current: balance.current, result: balance.result, resultRate: balance.resultRate };
}

// Uma linha por equipe ligada, na ordem do catálogo; sem nenhuma ligada, nenhuma consulta às recomendações.
export async function buildPlanTeams(params: PlanTeamsParams): Promise<readonly TeamPlanView[]> {
  const enabled = new Set(params.enabled);
  const keys = MODEL_TEAM_KEYS.filter((teamKey) => enabled.has(teamKey));
  if (keys.length === 0) return [];
  const overview = await params.reports.readOverview({
    exchange: params.exchange,
    symbol: params.run.symbol,
    limitPerTeam: TRADE_PLAN_TEAM_REPORTS,
    onDemandIds: [],
    scoreboardDays: MODEL_TEAM_SCOREBOARD_DAYS,
    failureHours: MODEL_TEAM_FAILURE_HOURS,
  });
  return keys.map((teamKey) =>
    buildTeamPlan({
      teamKey,
      basis: params.basis,
      reports: overview.latest,
      wallet: walletOf(params, teamKey),
    }),
  );
}
