// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, test } from 'bun:test';

import type { RunDispatcher } from '../apps/api-cryptoada/src/runs/run-dispatcher.js';
import { loadApiApp } from './fixtures/api-routes/api-app.fixture.js';

const app = await loadApiApp();
const RUN_ID = '0192f3a1-7c4e-7b2a-9d3f-5e6a7b8c9d21';

type Calls = { backtest: string[]; walkForward: string[]; reported: unknown[] };

// Um executor que não termina (a thread ainda roda) ou que rejeita sem avisar.
function build(failure?: Error): { readonly calls: Calls; readonly dispatcher: RunDispatcher } {
  const calls: Calls = { backtest: [], walkForward: [], reported: [] };
  const outcome = (): Promise<never> =>
    failure === undefined ? new Promise<never>(() => undefined) : Promise.reject(failure);
  return {
    calls,
    dispatcher: app.directDispatcher.createDirectRunDispatcher({
      backtestRunner: {
        run: (runId): Promise<never> => {
          calls.backtest.push(runId);
          return outcome();
        },
      },
      walkForwardRunner: {
        run: (runId): Promise<never> => {
          calls.walkForward.push(runId);
          return outcome();
        },
      },
      reportUnexpectedError: (error) => calls.reported.push(error),
    }),
  };
}

describe('RunDispatcher padrão (despacho direto para a thread, sem teto por usuário)', () => {
  test('entrega o backtest ao executor de backtest e o walk-forward ao de walk-forward', async () => {
    const { calls, dispatcher } = build();
    await dispatcher.dispatch({ runId: RUN_ID, kind: 'backtest' });
    await dispatcher.dispatch({ runId: RUN_ID, kind: 'walk_forward' });
    expect(calls.backtest).toStrictEqual([RUN_ID]);
    expect(calls.walkForward).toStrictEqual([RUN_ID]);
  });

  test('NÃO espera a execução terminar: resolve na hora mesmo com a thread rodando', async () => {
    const { dispatcher } = build();
    const winner = await Promise.race([
      dispatcher.dispatch({ runId: RUN_ID, kind: 'backtest' }).then(() => 'dispatched'),
      Bun.sleep(1_000).then(() => 'blocked'),
    ]);
    expect(winner).toBe('dispatched');
  });

  test('tipo sem executor (live_paper) rejeita, para a rota marcar DISPATCH_FAILED', async () => {
    const { calls, dispatcher } = build();
    const rejection = await dispatcher.dispatch({ runId: RUN_ID, kind: 'live_paper' }).then(
      () => undefined,
      (error: unknown) => error,
    );
    expect(rejection).toBeInstanceOf(Error);
    expect(calls.backtest).toStrictEqual([]);
    expect(calls.walkForward).toStrictEqual([]);
  });

  test('rejeição inesperada do executor é reportada, nunca vira rejeição sem dono', async () => {
    const { calls, dispatcher } = build(new Error('executor caiu'));
    await dispatcher.dispatch({ runId: RUN_ID, kind: 'backtest' });
    await Bun.sleep(20);
    expect(calls.reported).toHaveLength(1);
  });
});
