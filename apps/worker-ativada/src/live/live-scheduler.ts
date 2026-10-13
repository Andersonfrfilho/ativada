// Copyright (c) 2026 Ada Technology. All rights reserved.
import { readErrorName } from '@ativada/environment';

import type { WorkerLogger } from '../logging/worker-logger.js';
import type { LoopOutageGuard } from '../outage/loop-outage-guard.js';
import { LIVE_LOG } from './live.constant.js';
import type { LiveEvaluator } from './live-run.types.js';

export type LiveScheduler = {
  readonly start: () => void;
  // Um candle novo foi gravado: avalia já, sem esperar a próxima ronda.
  readonly trigger: () => void;
  // Para as rondas, espera a que estiver no ar e devolve as simulações da instância à fila.
  readonly stop: () => Promise<void>;
};

export type LiveSchedulerDependencies = {
  readonly evaluator: LiveEvaluator;
  readonly logger: WorkerLogger;
  readonly pollMilliseconds: number;
  // Banco fora: a ronda espera o backoff do porteiro e a queda sai resumida (uma linha por minuto), sem erro cru.
  readonly outage?: LoopOutageGuard | undefined;
};

type SchedulerState = {
  timer: ReturnType<typeof setInterval> | undefined;
  current: Promise<void>;
  isRunning: boolean;
  isStopped: boolean;
  isRequested: boolean;
};

async function runTick(dependencies: LiveSchedulerDependencies): Promise<void> {
  const { outage } = dependencies;
  if (outage?.isWaiting() === true) return;
  try {
    await dependencies.evaluator.tick();
    outage?.handleSuccess();
  } catch (error: unknown) {
    if (outage?.handleFailure(error) === true) return;
    dependencies.logger.error(LIVE_LOG.TICK_FAILED, { errorName: readErrorName(error) });
  }
}

// Devolver à fila é cortesia: com o banco fora do ar o erro vai ao log (só o nome) e o encerramento termina mesmo assim; o
// batimento vence e outra instância assume do checkpoint (ADR 0002, T3.6).
async function releaseBestEffort(dependencies: LiveSchedulerDependencies): Promise<void> {
  try {
    await dependencies.evaluator.release();
  } catch (error: unknown) {
    dependencies.logger.error(LIVE_LOG.RELEASE_FAILED, { errorName: readErrorName(error) });
  }
}

// Rondas nunca se sobrepõem; um pedido que chega durante uma ronda roda logo depois dela.
async function drain(
  dependencies: LiveSchedulerDependencies,
  state: SchedulerState,
): Promise<void> {
  state.isRunning = true;
  while (state.isRequested && !state.isStopped) {
    state.isRequested = false;
    await runTick(dependencies);
  }
  state.isRunning = false;
}

export function createLiveScheduler(dependencies: LiveSchedulerDependencies): LiveScheduler {
  const state: SchedulerState = {
    timer: undefined,
    current: Promise.resolve(),
    isRunning: false,
    isStopped: false,
    isRequested: false,
  };
  const trigger = (): void => {
    if (state.isStopped) return;
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
      await releaseBestEffort(dependencies);
    },
  };
}
