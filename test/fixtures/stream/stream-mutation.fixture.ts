// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { MutantTarget } from '../walk-forward/walk-forward-mutation.fixture.js';
import { STREAM_APP_SOURCE_VARIABLE } from './stream-app.fixture.js';

const REPOSITORY_ROOT = new URL('../../../', import.meta.url).pathname;

// O WebSocket de tempo real (T4.4): a cópia leva o `src` INTEIRO da API, porque o endpoint importa o roteador, os erros e o
// limitador; é julgada só pelos contratos do stream, do ticket e do fechamento dos sockets ao bloquear ou apagar a conta.
export const STREAM_MUTANT_TARGET: MutantTarget = {
  sourceDirectory: `${REPOSITORY_ROOT}apps/api-cryptoada/src`,
  mutantRoot: `${REPOSITORY_ROOT}apps/api-cryptoada/.mutants`,
  directoryPrefix: 'stream-',
  judgeTestFiles: [
    'test/stream-hub.contract.test.ts',
    'test/stream-sweep.contract.test.ts',
    'test/run-event-dispatcher.contract.test.ts',
    'test/stream-endpoint.contract.test.ts',
    'test/stream-environment.contract.test.ts',
    'test/stream-ticket.contract.test.ts',
    'test/stream-account-closers.contract.test.ts',
    'test/stream-server-stop.contract.test.ts',
  ],
  sourceVariable: STREAM_APP_SOURCE_VARIABLE,
  judgeTimeoutMilliseconds: 180_000,
  shouldBailOnFirstFailure: true,
};
