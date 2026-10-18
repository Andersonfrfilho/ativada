// Copyright (c) 2026 Ada Technology. All rights reserved.
import {
  createAnalystDecisionRepository,
  createCandleRepository,
  createModelDuelRepository,
  createModelTeamReadRepository,
  createRunQueueRepository,
  createRunRepository,
  createStrategyRepository,
  createTeamReportRepository,
  createUserModelTeamRepository,
  createWorkerHeartbeatRepository,
  type DatabaseHandle,
} from '@ativada/database';

import type { Environment } from '../environment.js';
import type { EnabledMarkets } from '../markets/candles-query.schema.js';
import type { CreateRunUseCase } from '../runs/create-run.use-case.js';
import {
  createListMyModelTeamsUseCase,
  createSetMyModelTeamUseCase,
} from './me-model-teams.use-case.js';
import type { MyModelTeamsRouteDependencies } from './me-model-teams.routes.js';
import { createModelDuelCreateUseCase } from './model-duel-create.use-case.js';
import { createModelDuelReadUseCase } from './model-duel-read.use-case.js';
import type { ModelDuelRouteDependencies } from './model-duels.routes.js';
import { createModelOpinionRequestUseCase } from './model-opinion-request.use-case.js';
import { createRunModelTeamsComparisonUseCase } from './run-model-teams-comparison.use-case.js';
import { createRunModelTeamsUseCase } from './run-model-teams.use-case.js';
import type { RunModelTeamsRouteDependencies } from './run-model-teams.routes.js';

export type ModelTeamRouteDependencies = {
  readonly me: MyModelTeamsRouteDependencies;
  readonly runs: RunModelTeamsRouteDependencies;
  readonly duels: ModelDuelRouteDependencies;
};

export type ModelTeamWiringParams = {
  readonly environment: Environment;
  readonly database: DatabaseHandle;
  readonly now: () => number;
  readonly enabled: EnabledMarkets;
  // O caso de uso de criação de execuções: o duelo cria cada execução pelo MESMO caminho de `POST /v1/runs`.
  readonly createRun: CreateRunUseCase;
};

function createMeDependencies(params: ModelTeamWiringParams): MyModelTeamsRouteDependencies {
  const { environment, database } = params;
  const base = {
    teams: createUserModelTeamRepository(database),
    heartbeat: createWorkerHeartbeatRepository(database),
    heartbeatSeconds: environment.WORKER_HEARTBEAT_SECONDS,
  };
  return {
    listMyModelTeams: createListMyModelTeamsUseCase(base),
    setMyModelTeam: createSetMyModelTeamUseCase(base),
  };
}

function createRunDependencies(params: ModelTeamWiringParams): RunModelTeamsRouteDependencies {
  const { environment, database } = params;
  const teams = createUserModelTeamRepository(database);
  const heartbeat = createWorkerHeartbeatRepository(database);
  const reports = createModelTeamReadRepository(database);
  const candles = createCandleRepository(database);
  const runDependencies = {
    runs: createRunRepository(database),
    strategies: createStrategyRepository(database),
    exchange: environment.MARKET_EXCHANGE,
  };
  const heartbeatSeconds = environment.WORKER_HEARTBEAT_SECONDS;
  return {
    runModelTeams: createRunModelTeamsUseCase({
      ...runDependencies,
      teams,
      heartbeat,
      heartbeatSeconds,
      reports,
    }),
    comparison: createRunModelTeamsComparisonUseCase({
      ...runDependencies,
      candles,
      analyst: createAnalystDecisionRepository(database),
      reports,
    }),
    requestOpinion: createModelOpinionRequestUseCase({
      ...runDependencies,
      teams,
      heartbeat,
      heartbeatSeconds,
      reports: createTeamReportRepository(database),
      candles,
      onDemandPerUserPerDay: environment.MODEL_TEAM_ON_DEMAND_PER_USER_PER_DAY,
    }),
  };
}

function createDuelDependencies(params: ModelTeamWiringParams): ModelDuelRouteDependencies {
  const { environment, database } = params;
  return {
    enabled: params.enabled,
    createDuel: createModelDuelCreateUseCase({
      createRun: params.createRun,
      teams: createUserModelTeamRepository(database),
      queue: createRunQueueRepository(database),
      runs: createRunRepository(database),
      now: params.now,
      newDuelId: () => Bun.randomUUIDv7(),
    }),
    readDuel: createModelDuelReadUseCase({
      duels: createModelDuelRepository(database),
      reports: createModelTeamReadRepository(database),
      exchange: environment.MARKET_EXCHANGE,
    }),
  };
}

// As rotas das equipes de modelo (spec 015): o interruptor do usuário, o estado e a comparação na sala, o pedido avulso e o duelo.
// O worker é quem tem a chave; aqui só se lê o banco (o batimento do worker, os relatórios gravados) e se enfileira o pedido avulso.
export function createModelTeamDependencies(
  params: ModelTeamWiringParams,
): ModelTeamRouteDependencies {
  return {
    me: createMeDependencies(params),
    runs: createRunDependencies(params),
    duels: createDuelDependencies(params),
  };
}
