// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, test } from 'bun:test';

import {
  createWalkForwardThreadRunner,
  type WalkForwardThreadRunner,
} from '../apps/api-cryptoada/src/walk-forward/walk-forward-thread-runner.js';

const RUN_ID = '018f0000-0000-7000-8000-0000000000f1';
const TIMEOUT_MILLISECONDS = 60_000;

function workerUrl(name: string): string {
  return new URL(`./fixtures/walk-forward/${name}.ts`, import.meta.url).href;
}

type Recorded = { readonly runId: string; readonly errorCode: string };

function createRunner(params: {
  readonly worker: string;
  readonly timeoutMilliseconds?: number;
  readonly failures: Recorded[];
  readonly progress?: number[];
}): WalkForwardThreadRunner {
  return createWalkForwardThreadRunner({
    workerUrl: workerUrl(params.worker),
    workerEnvironment: {},
    timeoutMilliseconds: params.timeoutMilliseconds ?? TIMEOUT_MILLISECONDS,
    recordFailure: (failure) => {
      params.failures.push(failure);
      return Promise.resolve(true);
    },
    onProgress: (event) => params.progress?.push(event.progress),
  });
}

describe('walk-forward: a thread coordenadora', () => {
  test(
    'a thread de produção conclui e informa progresso; o resultado vai para o banco, não pela mensagem',
    async () => {
      const failures: Recorded[] = [];
      const progress: number[] = [];
      const runner = createRunner({ worker: 'test-walk-forward.worker', failures, progress });
      const outcome = await runner.run(RUN_ID);
      expect(outcome.status).toBe('completed');
      if (outcome.status !== 'completed') return;
      expect(outcome).toMatchObject({ windows: 4, combinations: 12 });
      expect(outcome.phases.search).toBeGreaterThan(0);
      expect(progress.length).toBeGreaterThan(3);
      expect(progress.every((value) => value >= 0 && value <= 99)).toBe(true);
      expect(failures).toEqual([]);
      expect(Object.keys(outcome)).not.toContain('metrics');
    },
    TIMEOUT_MILLISECONDS,
  );

  test('pedido gravado fora do esquema falha dentro da thread, com código estável', async () => {
    const failures: Recorded[] = [];
    const runner = createRunner({ worker: 'invalid-request-walk-forward.worker', failures });
    const outcome = await runner.run(RUN_ID);
    expect(outcome.status).toBe('failed');
    expect(outcome.status === 'failed' && outcome.errorCode).toBe('INVALID_WINDOW_CONFIG');
  });

  test('a thread que morre vira WORKER_CRASHED, gravado pela thread principal', async () => {
    const failures: Recorded[] = [];
    const runner = createRunner({ worker: 'crashing-walk-forward.worker', failures });
    const outcome = await runner.run(RUN_ID);
    expect(outcome.status === 'failed' && outcome.errorCode).toBe('WORKER_CRASHED');
    expect(failures).toEqual([{ runId: RUN_ID, errorCode: 'WORKER_CRASHED' }]);
  });

  test('evento fora do esquema também derruba a execução', async () => {
    const failures: Recorded[] = [];
    const runner = createRunner({ worker: 'rude-walk-forward.worker', failures });
    const outcome = await runner.run(RUN_ID);
    expect(outcome.status === 'failed' && outcome.errorCode).toBe('WORKER_CRASHED');
  });

  test('a thread que não responde é terminada no tempo limite: WALK_FORWARD_TIMEOUT', async () => {
    const failures: Recorded[] = [];
    const runner = createRunner({
      worker: 'silent-walk-forward.worker',
      timeoutMilliseconds: 300,
      failures,
    });
    const outcome = await runner.run(RUN_ID);
    expect(outcome.status === 'failed' && outcome.errorCode).toBe('WALK_FORWARD_TIMEOUT');
    expect(failures).toEqual([{ runId: RUN_ID, errorCode: 'WALK_FORWARD_TIMEOUT' }]);
  });

  test('o encerramento da API termina a thread e deixa a execução como estava', async () => {
    const failures: Recorded[] = [];
    const runner = createRunner({ worker: 'silent-walk-forward.worker', failures });
    const pending = runner.run(RUN_ID);
    await runner.terminateAll();
    const outcome = await pending;
    expect(outcome.status).toBe('terminated');
    expect(failures).toEqual([]);
  });
});
