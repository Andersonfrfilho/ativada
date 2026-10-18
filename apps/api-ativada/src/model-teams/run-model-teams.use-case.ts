// Copyright (c) 2026 Ada Technology. All rights reserved.
import type {
  ModelTeamOverview,
  ModelTeamReadRepository,
  OwnerScope,
  TeamReportRow,
  UserModelTeamRepository,
  WorkerHeartbeatRepository,
} from '@ativada/database';
import {
  COMPARISON_NOTICE,
  COST_ESTIMATE_NOTICE,
  MODEL_TEAM_KEYS,
  readSignalSource,
  TEAM_NOTICE,
  type ModelTeamKey,
} from '@ativada/model-agents';
import { EngineDecimal, formatEngineDecimal } from '@ativada/strategy-engine';

import {
  findLiveRun,
  type LiveStatusRunDependencies,
} from '../runs/live-status/live-status-context.js';
import {
  MODEL_TEAM_FAILURE_HOURS,
  MODEL_TEAM_RECENT_REPORTS,
  MODEL_TEAM_SCOREBOARD_DAYS,
} from './model-team.constant.js';
import { toRecommendation, toScoreboard, toTeamView } from './model-team-view.js';
import type { RecommendationView } from './model-team-view.schema.js';
import { readProviderStates } from './provider-state.js';
import type {
  RunModelTeamsQuery,
  RunModelTeamsView,
  TeamStateView,
} from './run-model-teams.schema.js';

const COST_DECIMAL_PLACES = 8;
const ZERO_COST = '0';

export type RunModelTeamsDependencies = LiveStatusRunDependencies & {
  readonly teams: Pick<UserModelTeamRepository, 'listTeams'>;
  readonly heartbeat: Pick<WorkerHeartbeatRepository, 'findLatest'>;
  readonly heartbeatSeconds: number;
  readonly reports: Pick<ModelTeamReadRepository, 'readOverview'>;
};

export type RunModelTeamsUseCase = (
  scope: OwnerScope,
  runId: string,
  query: RunModelTeamsQuery,
) => Promise<RunModelTeamsView>;

function recommendationsOf(
  rows: readonly TeamReportRow[],
  teamKey: ModelTeamKey,
): readonly RecommendationView[] {
  return rows
    .filter((row) => row.teamKey === teamKey)
    .flatMap((row) => {
      const view = toRecommendation(row);
      return view === undefined ? [] : [view];
    });
}

function sumCost(values: readonly string[]): string {
  const total = values.reduce((sum, value) => sum.plus(value), new EngineDecimal(ZERO_COST));
  return formatEngineDecimal(total.toDecimalPlaces(COST_DECIMAL_PLACES, EngineDecimal.ROUND_UP));
}

function toTeamState(params: {
  readonly teamKey: ModelTeamKey;
  readonly overview: ModelTeamOverview;
  readonly team: TeamStateView['team'];
}): TeamStateView {
  const { teamKey, overview } = params;
  const spend = overview.spend.find((row) => row.teamKey === teamKey);
  const failures = overview.failures.find((row) => row.teamKey === teamKey);
  return {
    team: params.team,
    recent: [...recommendationsOf(overview.latest, teamKey)],
    onDemand: [...recommendationsOf(overview.onDemand, teamKey)],
    scoreboard: toScoreboard(overview.scores.find((row) => row.teamKey === teamKey)),
    cost: { todayUsd: spend?.dayUsd ?? ZERO_COST, monthUsd: spend?.monthUsd ?? ZERO_COST },
    failures: {
      hours: MODEL_TEAM_FAILURE_HOURS,
      total: failures?.total ?? 0,
      failed: failures?.failed ?? 0,
    },
  };
}

// O estado das equipes na sala da simulação (spec 015, RF16 a RF19): quatro consultas (a execução do dono, o interruptor, o
// batimento e UMA consulta com recomendações, pedidos avulsos, placar, custo e falhas). Execução alheia, inexistente ou apagada é o
// mesmo 404; outro tipo é 409 `RUN_NOT_LIVE`. O placar e as recomendações são do PAR (dado público); só o interruptor é do dono.
export function createRunModelTeamsUseCase(
  dependencies: RunModelTeamsDependencies,
): RunModelTeamsUseCase {
  return async (scope, runId, query) => {
    const run = await findLiveRun(dependencies, { scope, runId });
    const [records, heartbeat, overview] = await Promise.all([
      dependencies.teams.listTeams(scope),
      dependencies.heartbeat.findLatest(),
      dependencies.reports.readOverview({
        exchange: dependencies.exchange,
        symbol: run.symbol,
        limitPerTeam: MODEL_TEAM_RECENT_REPORTS,
        onDemandIds: query.opinionIds ?? [],
        scoreboardDays: MODEL_TEAM_SCOREBOARD_DAYS,
        failureHours: MODEL_TEAM_FAILURE_HOURS,
      }),
    ]);
    const states = readProviderStates({
      heartbeat,
      heartbeatSeconds: dependencies.heartbeatSeconds,
    });
    const enabled = new Set(records.filter((row) => row.isEnabled).map((row) => row.teamKey));
    const teams = MODEL_TEAM_KEYS.map((teamKey) =>
      toTeamState({
        teamKey,
        overview,
        team: toTeamView({ teamKey, isEnabled: enabled.has(teamKey), provider: states[teamKey] }),
      }),
    );
    return toView({ symbol: run.symbol, request: run.request, teams });
  };
}

function toView(params: {
  readonly symbol: string;
  readonly request: unknown;
  readonly teams: readonly TeamStateView[];
}): RunModelTeamsView {
  const { teams } = params;
  return {
    symbol: params.symbol,
    signalSource: readSignalSource(params.request) ?? null,
    notice: TEAM_NOTICE,
    costNotice: COST_ESTIMATE_NOTICE,
    comparisonNotice: COMPARISON_NOTICE,
    teams: [...teams],
    totalCost: {
      todayUsd: sumCost(teams.map((state) => state.cost.todayUsd)),
      monthUsd: sumCost(teams.map((state) => state.cost.monthUsd)),
    },
  };
}
