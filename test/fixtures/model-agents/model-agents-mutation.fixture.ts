// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { MutantTarget } from '../walk-forward/walk-forward-mutation.fixture.js';
import { MODEL_AGENTS_SOURCE_VARIABLE } from './model-agents-api.fixture.js';

const REPOSITORY_ROOT = new URL('../../../', import.meta.url).pathname;

// O pacote `model-agents` inteiro (T1.5 da spec 015): a cópia mutada de `packages/model-agents/src` fica DENTRO do pacote,
// de onde `zod`, `@ativada/strategy-engine` e `@ativada/statistics` se resolvem como no código de produção. Os juízes são
// os contratos que carregam o código por `loadModelAgentsApi()`; o de fronteira lê o `src` de produção e fica de fora.
export const MODEL_AGENTS_MUTANT_TARGET: MutantTarget = {
  sourceDirectory: `${REPOSITORY_ROOT}packages/model-agents/src`,
  mutantRoot: `${REPOSITORY_ROOT}packages/model-agents/.mutants`,
  directoryPrefix: 'team-',
  judgeTestFiles: [
    'test/model-agents-schemas.contract.test.ts',
    'test/model-agents-prompt.contract.test.ts',
    'test/model-agents-hygiene.contract.test.ts',
    'test/model-agents-cost-budget.contract.test.ts',
    'test/model-agents-circuit.contract.test.ts',
    'test/model-agents-team-signal.contract.test.ts',
    'test/model-agents-auditor.contract.test.ts',
  ],
  sourceVariable: MODEL_AGENTS_SOURCE_VARIABLE,
  judgeTimeoutMilliseconds: 240_000,
  shouldBailOnFirstFailure: true,
};
