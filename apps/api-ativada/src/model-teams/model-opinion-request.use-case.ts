// Copyright (c) 2026 Ada Technology. All rights reserved.
import {
  RUN_STATUS,
  type CandleRepository,
  type OwnerScope,
  type TeamReportRepository,
  type UserModelTeamRepository,
  type WorkerHeartbeatRepository,
} from '@ativada/database';
import { MODEL_TEAMS, type ModelTeamKey } from '@ativada/model-agents';

import { findAnalystRun } from '../runs/analyst/analyst-run.js';
import type { LiveStatusRunDependencies } from '../runs/live-status/live-status-context.js';
import { RunNotRunningError } from '../runs/run.error.js';
import {
  ModelOpinionLimitReachedError,
  ModelTeamDisabledError,
  ModelTeamUnavailableError,
} from './model-team.error.js';
import { readProviderStates } from './provider-state.js';

const TIMEFRAME = '15m';

export type ModelOpinionRequestDependencies = LiveStatusRunDependencies & {
  readonly teams: Pick<UserModelTeamRepository, 'listTeams' | 'claimOnDemand'>;
  readonly heartbeat: Pick<WorkerHeartbeatRepository, 'findLatest'>;
  readonly heartbeatSeconds: number;
  readonly reports: Pick<TeamReportRepository, 'enqueueOnDemandReport'>;
  readonly candles: Pick<CandleRepository, 'findLatestOpenTime'>;
  // Teto de pedidos avulsos por usuário e dia (UTC): `MODEL_TEAM_ON_DEMAND_PER_USER_PER_DAY`.
  readonly onDemandPerUserPerDay: number;
};

export type OpinionRequested = { readonly opinionId: string };

export type ModelOpinionRequestUseCase = (
  scope: OwnerScope,
  params: { readonly runId: string; readonly teamKey: ModelTeamKey },
) => Promise<OpinionRequested>;

// "Pedir opinião agora" (RF20): um relatório AVULSO sobre a última vela fechada do par. Entra na mesma fila, passa pelo mesmo
// despachante, teto de custo e circuito, e nunca comanda ordem nem entra no placar. A ordem das recusas é a das rotas vizinhas:
// execução (404), não ao vivo (409), sem analista (409), parada (409), equipe desligada (409), provedor fora (409) e, por
// último, o teto diário (429), que só gasta pedido depois de tudo o mais ter passado.
export function createModelOpinionRequestUseCase(
  dependencies: ModelOpinionRequestDependencies,
): ModelOpinionRequestUseCase {
  return async (scope, params) => {
    const { run } = await findAnalystRun(dependencies, { scope, runId: params.runId });
    if (run.status !== RUN_STATUS.RUNNING) throw new RunNotRunningError();
    const [records, heartbeat, candleTime] = await Promise.all([
      dependencies.teams.listTeams(scope),
      dependencies.heartbeat.findLatest(),
      dependencies.candles.findLatestOpenTime({
        exchange: dependencies.exchange,
        symbol: run.symbol,
        timeframe: TIMEFRAME,
      }),
    ]);
    if (!records.some((row) => row.teamKey === params.teamKey && row.isEnabled)) {
      throw new ModelTeamDisabledError();
    }
    const provider = readProviderStates({
      heartbeat,
      heartbeatSeconds: dependencies.heartbeatSeconds,
    })[params.teamKey];
    if (!provider.isAvailable || candleTime === undefined) throw new ModelTeamUnavailableError();
    const isClaimed = await dependencies.teams.claimOnDemand(scope, {
      teamKey: params.teamKey,
      dailyLimit: dependencies.onDemandPerUserPerDay,
    });
    if (!isClaimed) throw new ModelOpinionLimitReachedError();
    const opinionId = await dependencies.reports.enqueueOnDemandReport({
      teamKey: params.teamKey,
      provider: MODEL_TEAMS[params.teamKey].provider,
      symbol: run.symbol,
      candleTime,
    });
    return { opinionId };
  };
}
