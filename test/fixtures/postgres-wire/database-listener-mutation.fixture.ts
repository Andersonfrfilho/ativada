// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { MutantTarget } from '../walk-forward/walk-forward-mutation.fixture.js';
import { DATABASE_SOURCE_VARIABLE } from './database-source.fixture.js';

const REPOSITORY_ROOT = new URL('../../../', import.meta.url).pathname;

// O escutador de LISTEN/NOTIFY e o aviso de execução (T4.4): a cópia leva o `src` INTEIRO do pacote do banco, julgada só
// pelos contratos do escutador, do protocolo, do SCRAM e do formato do aviso.
export const DATABASE_LISTENER_MUTANT_TARGET: MutantTarget = {
  sourceDirectory: `${REPOSITORY_ROOT}packages/database/src`,
  mutantRoot: `${REPOSITORY_ROOT}packages/database/.mutants`,
  directoryPrefix: 'listener-',
  judgeTestFiles: [
    'test/postgres-wire.contract.test.ts',
    'test/scram-sha-256.contract.test.ts',
    'test/postgres-connection-url.contract.test.ts',
    'test/notification-listener.contract.test.ts',
    'test/database-tls.contract.test.ts',
    'test/run-event.contract.test.ts',
  ],
  sourceVariable: DATABASE_SOURCE_VARIABLE,
  judgeTimeoutMilliseconds: 180_000,
  shouldBailOnFirstFailure: true,
};
