// Copyright (c) 2026 Ada Technology. All rights reserved.
import {
  createModelTeamReadRepository,
  createRunLiveStatusRepository,
  createRunProjectionRepository,
  createSentimentObservationRepository,
  createStrategyRepository,
  createUserModelTeamRepository,
  type CandleRepository,
  type RunRepository,
  type RunResultRepository,
} from '@ativada/database';

import { createRunChartUseCase } from '../runs/chart/run-chart.use-case.js';
import { createLiveStatusUseCase } from '../runs/live-status/live-status.use-case.js';
import { createLiveSummaryUseCase } from '../runs/live-summary/live-summary.use-case.js';
import { createRunDecisionsUseCase } from '../runs/live-status/run-decisions.use-case.js';
import { createProjectionsUseCase } from '../runs/projections/projections.use-case.js';
import { createStrategyLayersUseCase } from '../runs/projections/strategy-layers.use-case.js';
import {
  createQuestionReadingsCache,
  type QuestionReadingsDependencies,
} from '../runs/questions/question-readings.js';
import { createQuestionsUseCase } from '../runs/questions/questions.use-case.js';
import { createTradePlanUseCase } from '../runs/trade-plan/trade-plan.use-case.js';
import type { LiveAwareUseCases } from './create-api-routes.js';
import type { DomainRouteParams } from './create-domain-route-dependencies.js';

// As velas e o sentimento públicos que "Pergunte à equipe" lê, com o cache da instância.
function questionReaders(
  params: DomainRouteParams,
  candles: Pick<CandleRepository, 'findCandles'>,
): Omit<QuestionReadingsDependencies, 'exchange'> {
  return {
    candles,
    sentiments: createSentimentObservationRepository(params.database),
    now: params.now,
    cache: createQuestionReadingsCache(),
  };
}

type LiveAwareShared = {
  readonly runs: RunRepository;
  readonly results: RunResultRepository;
  readonly candles: Pick<CandleRepository, 'findCandles'>;
  readonly exchange: string;
};

// As leituras do acompanhamento ao vivo (spec 008): o gráfico, o live-status e as decisões compartilham o repositório por
// dono e a versão da estratégia; a hora vem do relógio injetado.
export function createLiveAwareUseCases(
  params: DomainRouteParams,
  shared: LiveAwareShared,
): LiveAwareUseCases {
  const readers = {
    strategies: createStrategyRepository(params.database),
    live: createRunLiveStatusRepository(params.database),
  };
  const dependencies = { ...readers, runs: shared.runs, exchange: shared.exchange };
  const projectionDependencies = {
    ...dependencies,
    results: shared.results,
    projections: createRunProjectionRepository(params.database),
  };
  const projections = createProjectionsUseCase(projectionDependencies);
  const tradePlan = createTradePlanUseCase({
    ...dependencies,
    teams: createUserModelTeamRepository(params.database),
    reports: createModelTeamReadRepository(params.database),
  });
  return {
    chart: createRunChartUseCase({ ...shared, ...readers }),
    liveStatus: createLiveStatusUseCase({ ...dependencies, now: params.now }),
    liveSummary: createLiveSummaryUseCase(readers),
    decisions: createRunDecisionsUseCase(dependencies),
    projections,
    strategyLayers: createStrategyLayersUseCase(projectionDependencies),
    tradePlan,
    questions: createQuestionsUseCase({
      ...dependencies,
      ...questionReaders(params, shared.candles),
      tradePlan,
      projections,
    }),
  };
}
