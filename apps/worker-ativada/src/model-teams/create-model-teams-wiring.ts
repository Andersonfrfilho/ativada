// Copyright (c) 2026 Ada Technology. All rights reserved.
import {
  createCandleRepository,
  createSentimentObservationRepository,
  createTeamReportRepository,
  type DatabaseHandle,
  type JsonContainer,
} from '@ativada/database';
import { MILLISECONDS_PER_SECOND, readErrorName } from '@ativada/environment';
import type { BudgetLimits } from '@ativada/model-agents';

import type { Environment } from '../environment.js';
import type { WorkerLogger } from '../logging/worker-logger.js';
import { createLoopOutageGuard } from '../outage/loop-outage-guard.js';
import { buildTeamRuntimes, type TeamRuntime } from './build-team-runtimes.js';
import { createModelTeamLoop, type ModelTeamLoop } from './model-team-loop.js';
import { MODEL_TEAM_LOG } from './model-teams.constant.js';
import { buildProviderStatus } from './provider-status.js';
import { createReportDispatcher, type ReportDispatcher } from './report-dispatcher.js';
import { createReportEnqueuer, type ReportEnqueuer } from './report-scheduler.js';
import { createTeamCircuits, type TeamCircuits } from './team-circuits.js';

export type ModelTeamsWiring = {
  // Ausente = nenhuma chave configurada: nada sobe e nenhuma chamada sai (RF04).
  readonly loop: ModelTeamLoop | undefined;
  // O resumo do estado de cada equipe para o batimento do worker (RF23), só booleanos e códigos.
  readonly readStatus: () => JsonContainer;
  readonly stop: () => Promise<void>;
};

export type CreateModelTeamsWiringParams = {
  readonly environment: Environment;
  readonly database: DatabaseHandle;
  readonly logger: WorkerLogger;
  readonly now?: () => number;
};

type DispatcherParams = CreateModelTeamsWiringParams & {
  readonly now: () => number;
  readonly runtimes: readonly TeamRuntime[];
  readonly circuits: TeamCircuits;
  readonly budget: BudgetLimits;
  readonly signal: AbortSignal;
};

function createDispatcher(params: DispatcherParams): ReportDispatcher {
  const { environment, database } = params;
  const reports = createTeamReportRepository(database);
  return createReportDispatcher({
    claims: reports,
    concurrency: environment.MODEL_TEAM_CONCURRENCY,
    processor: {
      reports,
      sources: {
        exchange: environment.MARKET_EXCHANGE,
        candles: createCandleRepository(database),
        sentiment: createSentimentObservationRepository(database),
        reports,
      },
      runtimes: new Map(params.runtimes.map((runtime) => [runtime.teamKey, runtime])),
      circuits: params.circuits,
      settings: {
        timeoutMilliseconds: environment.MODEL_TEAM_TIMEOUT_SECONDS * MILLISECONDS_PER_SECOND,
        maxOutputTokens: environment.MODEL_TEAM_MAX_OUTPUT_TOKENS,
        budget: params.budget,
        entryTolerancePercent: environment.MODEL_TEAM_ENTRY_TOLERANCE_PERCENT,
        minStopPercent: environment.MODEL_TEAM_MIN_STOP_PERCENT,
      },
      logger: params.logger,
      now: params.now,
      signal: params.signal,
    },
  });
}

function createEnqueuer(
  params: CreateModelTeamsWiringParams & {
    readonly now: () => number;
    readonly runtimes: readonly TeamRuntime[];
  },
): ReportEnqueuer {
  const { environment, database } = params;
  return createReportEnqueuer({
    exchange: environment.MARKET_EXCHANGE,
    symbols: environment.MARKET_SYMBOLS,
    runtimes: params.runtimes,
    cadenceMinutes: Number(environment.MODEL_TEAM_CADENCE_MINUTES),
    candles: createCandleRepository(database),
    reports: createTeamReportRepository(database),
    now: params.now,
  });
}

// Falha ao enfileirar não impede despachar o que já está pendente (RNF01); só o nome do erro vai ao log.
async function runCycle(parts: {
  readonly enqueuer: ReportEnqueuer;
  readonly dispatcher: ReportDispatcher;
  readonly logger: WorkerLogger;
}): Promise<void> {
  try {
    await parts.enqueuer.enqueueLatest();
  } catch (error: unknown) {
    parts.logger.error(MODEL_TEAM_LOG.ENQUEUE_FAILED, { errorName: readErrorName(error) });
  }
  await parts.dispatcher.tick();
}

// MODO SOMBRA: as equipes só recomendam e gravam o relatório; nenhuma execução depende delas e nenhuma ordem sai.
export function createModelTeamsWiring(params: CreateModelTeamsWiringParams): ModelTeamsWiring {
  const { environment, database, logger } = params;
  const now = params.now ?? Date.now;
  const runtimes = buildTeamRuntimes(environment);
  const circuits = createTeamCircuits();
  const readStatus = (): JsonContainer => buildProviderStatus({ runtimes, circuits, now });
  const dailyUsd = environment.MODEL_TEAM_DAILY_BUDGET_USD;
  const monthlyUsd = environment.MODEL_TEAM_MONTHLY_BUDGET_USD;
  if (runtimes.length === 0 || dailyUsd === undefined || monthlyUsd === undefined) {
    return { loop: undefined, readStatus, stop: () => Promise.resolve() };
  }
  const abortController = new AbortController();
  const dispatcher = createDispatcher({
    ...params,
    now,
    runtimes,
    circuits,
    budget: { dailyUsd, monthlyUsd },
    signal: abortController.signal,
  });
  const enqueuer = createEnqueuer({ ...params, now, runtimes });
  const loop = createModelTeamLoop({
    cycle: () => runCycle({ enqueuer, dispatcher, logger }),
    logger,
    pollMilliseconds: environment.MODEL_TEAM_POLL_SECONDS * MILLISECONDS_PER_SECOND,
    outage: createLoopOutageGuard({ database, logger }),
  });
  return {
    loop,
    readStatus,
    stop: async (): Promise<void> => {
      abortController.abort();
      await loop.stop();
    },
  };
}
