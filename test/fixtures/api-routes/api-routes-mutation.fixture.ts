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
    'test/api-run-export.contract.test.ts',
    'test/api-openapi.contract.test.ts',
    'test/api-docs-page.contract.test.ts',
    'test/api-run-dispatcher.contract.test.ts',
  ],
  sourceVariable: 'API_ROUTES_APP_SOURCE',
};
