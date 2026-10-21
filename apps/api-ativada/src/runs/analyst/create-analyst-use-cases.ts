// Copyright (c) 2026 Ada Technology. All rights reserved.
import {
  createAnalystDecisionRepository,
  createStrategyRepository,
  type DatabaseHandle,
  type RunRepository,
} from '@ativada/database';

import {
  createAnalystDecisionsUseCase,
  type AnalystDecisionsUseCase,
} from './analyst-decisions.use-case.js';
import { createAnalystUseCase, type AnalystUseCase } from './analyst.use-case.js';

export type AnalystUseCases = {
  readonly analyst: AnalystUseCase;
  readonly analystDecisions: AnalystDecisionsUseCase;
};

// O analista de risco (spec 007) lê a execução do dono, a versão da estratégia e as decisões gravadas pelo worker; a hora
// vem do relógio injetado.
export function createAnalystUseCases(params: {
  readonly database: DatabaseHandle;
  readonly runs: RunRepository;
  readonly exchange: string;
  readonly now: () => number;
}): AnalystUseCases {
  const dependencies = {
    runs: params.runs,
    strategies: createStrategyRepository(params.database),
    exchange: params.exchange,
    analyst: createAnalystDecisionRepository(params.database),
  };
  return {
    analyst: createAnalystUseCase({ ...dependencies, now: params.now }),
    analystDecisions: createAnalystDecisionsUseCase(dependencies),
  };
}
