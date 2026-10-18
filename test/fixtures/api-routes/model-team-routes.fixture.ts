// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { Route } from '../../../apps/api-ativada/src/router/route.types.js';
import type { ApiApp } from './api-app.fixture.js';
import type { HarnessParts } from './runs-harness.fixture.js';
import { ENABLED_SYMBOLS, ENABLED_TIMEFRAMES, EXCHANGE } from './runs-harness.fixture.js';

export const HEARTBEAT_SECONDS = 30;
export const ON_DEMAND_PER_DAY = 2;

export type ModelTeamRouteOptions = {
  // A abertura da última vela de 15 min fechada do par (o que o repositório de velas devolveria).
  readonly latest: { openTime: number | undefined };
  readonly onDemandPerDay?: number;
};

// As rotas das equipes de modelo (spec 015) sobre os repositórios em memória do harness: os MESMOS casos de uso da produção.
export function buildModelTeamRoutes(
  app: ApiApp,
  parts: HarnessParts,
  options: ModelTeamRouteOptions,
): readonly Route[] {
  const { modelTeams, runs, strategies } = parts;
  const base = {
    teams: modelTeams.teams,
    heartbeat: modelTeams.heartbeat,
    heartbeatSeconds: HEARTBEAT_SECONDS,
  };
  const runDeps = { runs: runs.repository, strategies: strategies.repository, exchange: EXCHANGE };
  return [
    ...app.meModelTeamsRoutes.createMyModelTeamsRoutes({
      listMyModelTeams: app.meModelTeamsUseCase.createListMyModelTeamsUseCase(base),
      setMyModelTeam: app.meModelTeamsUseCase.createSetMyModelTeamUseCase(base),
    }),
    ...app.runModelTeamsRoutes.createRunModelTeamsRoutes({
      runModelTeams: app.runModelTeamsUseCase.createRunModelTeamsUseCase({
        ...runDeps,
        ...base,
        reports: modelTeams.reads,
      }),
      comparison: app.runModelTeamsComparison.createRunModelTeamsComparisonUseCase({
        ...runDeps,
        candles: parts.candles.repository,
        analyst: runs.analyst.repository,
        reports: modelTeams.reads,
      }),
      requestOpinion: app.modelOpinionRequest.createModelOpinionRequestUseCase({
        ...runDeps,
        ...base,
        reports: modelTeams.queue,
        candles: { findLatestOpenTime: () => Promise.resolve(options.latest.openTime) },
        onDemandPerUserPerDay: options.onDemandPerDay ?? ON_DEMAND_PER_DAY,
      }),
    }),
    ...app.modelDuelRoutes.createModelDuelRoutes({
      enabled: { symbols: ENABLED_SYMBOLS, timeframes: ENABLED_TIMEFRAMES },
      createDuel: app.modelDuelCreate.createModelDuelCreateUseCase({
        createRun: parts.createRun,
        teams: modelTeams.teams,
        queue: parts.runQueue.port,
        runs: runs.repository,
        now: () => parts.clock.now,
        newDuelId: () => crypto.randomUUID(),
      }),
      readDuel: app.modelDuelRead.createModelDuelReadUseCase({
        duels: modelTeams.duels,
        reports: modelTeams.reads,
        exchange: EXCHANGE,
      }),
    }),
  ];
}
