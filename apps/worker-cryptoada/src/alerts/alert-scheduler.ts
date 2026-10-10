// Copyright (c) 2026 Ada Technology. All rights reserved.
import { readErrorName } from '@cryptoada/environment';

import type { WorkerLogger } from '../logging/worker-logger.js';
import { ALERT_LOG } from './alerts.constant.js';
import type { AlertDispatcher } from './alert-dispatcher.js';

export type AlertScheduler = {
  readonly start: () => void;
  // Um alerta novo foi enfileirado: despacha já, sem esperar o próximo intervalo.
  readonly trigger: () => void;
  // Para o intervalo e espera o ciclo que estiver no ar.
  readonly stop: () => Promise<void>;
};

export type AlertSchedulerDependencies = {
  readonly dispatcher: Pick<AlertDispatcher, 'tick'>;
  readonly logger: WorkerLogger;
  readonly pollMilliseconds: number;
};

type SchedulerState = {
  timer: ReturnType<typeof setInterval> | undefined;
  current: Promise<void>;
  isRunning: boolean;
  isStopped: boolean;
  isRequested: boolean;
};

async function runTick(dependencies: AlertSchedulerDependencies): Promise<void> {
  try {
    await dependencies.dispatcher.tick();
  } catch (error: unknown) {
    // Só o nome: a mensagem do erro pode carregar a URL da Bot API, que leva o token.
    dependencies.logger.error(ALERT_LOG.DISPATCH_FAILED, { errorName: readErrorName(error) });
  }
}

// Ciclos nunca se sobrepõem; um pedido que chega durante um ciclo roda logo depois dele.
async function drain(
  dependencies: AlertSchedulerDependencies,
  state: SchedulerState,
): Promise<void> {
  state.isRunning = true;
  while (state.isRequested && !state.isStopped) {
    state.isRequested = false;
    await runTick(dependencies);
  }
  state.isRunning = false;
}

export function createAlertScheduler(dependencies: AlertSchedulerDependencies): AlertScheduler {
  const state: SchedulerState = {
    timer: undefined,
    current: Promise.resolve(),
    isRunning: false,
    isStopped: false,
    isRequested: false,
  };
  const trigger = (): void => {
    state.isRequested = true;
    if (!state.isRunning) state.current = drain(dependencies, state);
  };
  return {
    start: (): void => {
      state.timer = setInterval(trigger, dependencies.pollMilliseconds);
      trigger();
    },
    trigger,
    stop: async (): Promise<void> => {
      state.isStopped = true;
      if (state.timer !== undefined) clearInterval(state.timer);
      await state.current;
    },
  };
}
