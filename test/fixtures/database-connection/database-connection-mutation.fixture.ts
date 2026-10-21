// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { MutantTarget } from '../walk-forward/walk-forward-mutation.fixture.js';
import { DATABASE_CONNECTION_SOURCE_VARIABLE } from './database-connection-source.fixture.js';

const REPOSITORY_ROOT = new URL('../../../', import.meta.url).pathname;

// A reconexão do banco (spec 006, T1.1 a T1.3): a cópia leva o `src` INTEIRO do pacote e é julgada só pelos contratos do
// backoff, do porteiro com o dublê `flaky-sql` e do resumo de queda.
export const DATABASE_CONNECTION_MUTANT_TARGET: MutantTarget = {
  sourceDirectory: `${REPOSITORY_ROOT}packages/database/src`,
  mutantRoot: `${REPOSITORY_ROOT}packages/database/.mutants`,
  directoryPrefix: 'reconnect-',
  judgeTestFiles: [
    'test/database-reconnect-backoff.contract.test.ts',
    'test/database-resilient.contract.test.ts',
    'test/database-outage-log.contract.test.ts',
    'test/database-statement-timeout.contract.test.ts',
  ],
  sourceVariable: DATABASE_CONNECTION_SOURCE_VARIABLE,
  judgeTimeoutMilliseconds: 120_000,
  shouldBailOnFirstFailure: true,
};
