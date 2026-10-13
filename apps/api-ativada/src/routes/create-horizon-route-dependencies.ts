// Copyright (c) 2026 Ada Technology. All rights reserved.
import {
  createCandleRepository,
  createSentimentObservationRepository,
  createStrategyRepository,
  type DatabaseHandle,
} from '@ativada/database';

import type { Environment } from '../environment.js';
import { createGoalColdBudget } from '../goals/goal-cold-budget.js';
import { createColdEvaluationGate } from '../goals/goal-cold-gate.js';
import type { ComputeHorizonLine } from '../goals/goal-evaluation-pool.js';
import { createHorizonCache } from '../horizons/horizon-cache.js';
import type { HorizonEvaluation } from '../horizons/horizon-evaluation.types.js';
import { createHorizonEvaluationUseCase } from '../horizons/horizon-evaluation.use-case.js';
import type { HorizonRouteDependencies } from '../horizons/horizons.routes.js';
import type { RateLimiter } from '../rate-limit/rate-limiter.js';

export type HorizonRouteParams = {
  readonly environment: Environment;
  readonly database: DatabaseHandle;
  readonly now: () => number;
  // O limitador do roteador: o orçamento das avaliações a frio é o mesmo das metas.
  readonly rateLimiter: RateLimiter;
  // O cálculo roda no pool de threads (nunca na thread da API).
  readonly computeHorizon: ComputeHorizonLine;
};

// Os prazos dividem com as metas o orçamento das avaliações a frio (o mesmo limitador) e o pool de threads.
export function createHorizonRouteDependencies(
  params: HorizonRouteParams,
): HorizonRouteDependencies {
  const { database, environment } = params;
  return {
    enabledSymbols: environment.MARKET_SYMBOLS,
    evaluateHorizons: createHorizonEvaluationUseCase({
      strategies: createStrategyRepository(database),
      candles: createCandleRepository(database),
      sentiments: createSentimentObservationRepository(database),
      exchange: environment.MARKET_EXCHANGE,
      now: params.now,
      cache: createHorizonCache(),
      computeHorizon: params.computeHorizon,
      coldGate: createColdEvaluationGate<HorizonEvaluation>({
        maxConcurrent: environment.GOAL_EVALUATION_MAX_CONCURRENT,
        budget: createGoalColdBudget({ rateLimiter: params.rateLimiter }),
      }),
    }),
  };
}
