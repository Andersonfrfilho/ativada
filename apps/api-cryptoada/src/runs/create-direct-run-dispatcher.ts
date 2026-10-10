// Copyright (c) 2026 Ada Technology. All rights reserved.
import { RUN_KIND } from '@cryptoada/database';

import type { BacktestThreadRunner } from '../backtest/backtest-thread-runner.js';
import type { WalkForwardThreadRunner } from '../walk-forward/walk-forward-thread-runner.js';
import type { RunDispatcher } from './run-dispatcher.js';

export type DirectRunDispatcherDependencies = {
  readonly backtestRunner: Pick<BacktestThreadRunner, 'run'>;
  readonly walkForwardRunner: Pick<WalkForwardThreadRunner, 'run'>;
  readonly reportUnexpectedError: (error: unknown) => void;
};

// Implementação PADRÃO (T3.4): inicia a `worker_thread` da execução e devolve na hora, sem esperar o resultado — a
// rota responde 202. SEM teto por usuário nem fila: isso é da T3.6, que troca esta fábrica (ver `RunDispatcher`).
export function createDirectRunDispatcher(
  dependencies: DirectRunDispatcherDependencies,
): RunDispatcher {
  function track(outcome: Promise<unknown>): void {
    // O executor grava o próprio fim (`completed`, `failed`, `cancelled`); aqui só se evita rejeição sem dono.
    outcome.catch(dependencies.reportUnexpectedError);
  }
  return {
    dispatch: ({ runId, kind }): Promise<void> => {
      if (kind === RUN_KIND.BACKTEST) track(dependencies.backtestRunner.run(runId));
      else if (kind === RUN_KIND.WALK_FORWARD) track(dependencies.walkForwardRunner.run(runId));
      else return Promise.reject(new Error('Tipo de execução sem executor.'));
      return Promise.resolve();
    },
  };
}
