// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { MutantTarget } from '../walk-forward/walk-forward-mutation.fixture.js';
import { RISK_ANALYST_SOURCE_VARIABLE } from './risk-analyst-api.fixture.js';

const REPOSITORY_ROOT = new URL('../../../', import.meta.url).pathname;

// O pacote `risk-analyst` inteiro (T1.4 da spec 007): a cópia mutada de `packages/risk-analyst/src` fica DENTRO do pacote,
// de onde `@ativada/strategy-engine` e `@ativada/statistics` se resolvem como no código de produção. Os juízes são os
// contratos que carregam o código por `loadRiskAnalystApi()`; o de fronteira lê o `src` de produção e fica de fora.
export const RISK_ANALYST_MUTANT_TARGET: MutantTarget = {
  sourceDirectory: `${REPOSITORY_ROOT}packages/risk-analyst/src`,
  mutantRoot: `${REPOSITORY_ROOT}packages/risk-analyst/.mutants`,
  directoryPrefix: 'analyst-',
  judgeTestFiles: [
    'test/risk-analyst-market-readings.contract.test.ts',
    'test/risk-analyst-specialist-team.contract.test.ts',
    'test/risk-analyst-accuracy-auditor.contract.test.ts',
    'test/risk-analyst-team-forecast.contract.test.ts',
    'test/risk-analyst-risk-locks.contract.test.ts',
    'test/risk-analyst-posture-policy.contract.test.ts',
    'test/risk-analyst-decision.contract.test.ts',
    'test/risk-analyst-messages.contract.test.ts',
    'test/risk-analyst-properties.contract.test.ts',
    'test/risk-analyst-golden.contract.test.ts',
  ],
  sourceVariable: RISK_ANALYST_SOURCE_VARIABLE,
  judgeTimeoutMilliseconds: 240_000,
  shouldBailOnFirstFailure: true,
};
