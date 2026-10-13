// Copyright (c) 2026 Ada Technology. All rights reserved.
import {
  createCandleRepository,
  createSentimentObservationRepository,
  createStrategyRepository,
  type DatabaseHandle,
} from '@ativada/database';

import type { Environment } from '../environment.js';
import type { ColdEvaluationGate } from '../goals/goal-cold-gate.js';
import type { ComputeHorizonLine } from '../goals/goal-evaluation-pool.js';
import { createHorizonCache } from '../horizons/horizon-cache.js';
import type { HorizonEvaluation } from '../horizons/horizon-evaluation.types.js';
import { createHorizonEvaluationUseCase } from '../horizons/horizon-evaluation.use-case.js';
import type { HorizonRouteDependencies } from '../horizons/horizons.routes.js';

export type HorizonRouteParams = {
  readonly environment: Environment;
  readonly database: DatabaseHandle;
  readonly now: () => number;
  // O MESMO portão das metas: uma avaliação a frio em voo por usuário, teto global e o mesmo orçamento.
  readonly coldGate: ColdEvaluationGate<HorizonEvaluation>;
  // O cálculo roda no pool de threads (nunca na thread da API).
  readonly computeHorizon: ComputeHorizonLine;
};

// Os prazos dividem com as metas o portão das avaliações a frio (vaga por usuário, teto global, orçamento) e o pool de threads.
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
      coldGate: params.coldGate,
    }),
  };
}
