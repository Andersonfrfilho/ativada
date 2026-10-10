// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { MutantTarget } from '../walk-forward/walk-forward-mutation.fixture.js';

const REPOSITORY_ROOT = new URL('../../../', import.meta.url).pathname;

// As rotas REST (T3.4): a cópia leva o `src` INTEIRO da API, porque o roteador, os erros e o envelope têm de vir da
// mesma raiz que as rotas; os contratos de rota a carregam por `API_ROUTES_APP_SOURCE`.
export const API_ROUTES_MUTANT_TARGET: MutantTarget = {
  sourceDirectory: `${REPOSITORY_ROOT}apps/api-cryptoada/src`,
  mutantRoot: `${REPOSITORY_ROOT}apps/api-cryptoada/.mutants`,
  directoryPrefix: 'api-routes-',
  judgeTestFiles: [
    'test/api-markets.contract.test.ts',
    'test/api-strategies.contract.test.ts',
    'test/api-runs.contract.test.ts',
    'test/api-run-series.contract.test.ts',
    'test/api-cursor-instant.contract.test.ts',
    'test/api-run-export.contract.test.ts',
    'test/api-run-log-export.contract.test.ts',
    'test/api-openapi.contract.test.ts',
    'test/api-docs-page.contract.test.ts',
    'test/api-run-queue-dispatcher.contract.test.ts',
    'test/api-application-dispatcher.contract.test.ts',
    'test/api-run-admission.contract.test.ts',
  ],
  sourceVariable: 'API_ROUTES_APP_SOURCE',
};

// A semeadura da estratégia de exemplo (T3.5): o mesmo `src` da API, julgado só pelo contrato dela.
export const EXAMPLE_STRATEGY_MUTANT_TARGET: MutantTarget = {
  sourceDirectory: `${REPOSITORY_ROOT}apps/api-cryptoada/src`,
  mutantRoot: `${REPOSITORY_ROOT}apps/api-cryptoada/.mutants`,
  directoryPrefix: 'example-',
  judgeTestFiles: ['test/example-strategy.contract.test.ts'],
  sourceVariable: 'API_ROUTES_APP_SOURCE',
};

// A fila durável de execuções (T3.6): o despachante e os tetos de criação, julgados só pelos contratos deles.
export const RUN_QUEUE_MUTANT_TARGET: MutantTarget = {
  sourceDirectory: `${REPOSITORY_ROOT}apps/api-cryptoada/src`,
  mutantRoot: `${REPOSITORY_ROOT}apps/api-cryptoada/.mutants`,
  directoryPrefix: 'run-queue-',
  judgeTestFiles: [
    'test/api-run-queue-dispatcher.contract.test.ts',
    'test/api-application-dispatcher.contract.test.ts',
    'test/api-run-admission.contract.test.ts',
  ],
  sourceVariable: 'API_ROUTES_APP_SOURCE',
};

export const GOALS_MUTANT_TARGET: MutantTarget = {
  sourceDirectory: `${REPOSITORY_ROOT}apps/api-cryptoada/src`,
  mutantRoot: `${REPOSITORY_ROOT}apps/api-cryptoada/.mutants`,
  directoryPrefix: 'goals-',
  judgeTestFiles: [
    'test/api-goals.contract.test.ts',
    'test/api-goal-evaluation.contract.test.ts',
    'test/api-goal-runs.contract.test.ts',
    'test/api-openapi.contract.test.ts',
  ],
  sourceVariable: 'API_ROUTES_APP_SOURCE',
};
