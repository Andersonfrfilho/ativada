// Copyright (c) 2026 Ada Technology. All rights reserved.
import { readErrorName } from '@ativada/environment';

import type { WorkerLogger } from '../logging/worker-logger.js';
import type { LoopOutageGuard } from '../outage/loop-outage-guard.js';
import { MODEL_TEAM_LOG } from './model-teams.constant.js';

export type ModelTeamLoop = {
  readonly start: () => void;
  // Uma vela nova foi gravada: roda já, sem esperar o intervalo.
  readonly trigger: () => void;
  readonly stop: () => Promise<void>;
};

export type ModelTeamLoopDependencies = {
  // Um ciclo: enfileira o que a vela nova pede e despacha o que está pendente.
  readonly cycle: () => Promise<void>;
  readonly logger: WorkerLogger;
  readonly pollMilliseconds: number;
  readonly outage: LoopOutageGuard;
};

type LoopState = {
  timer: ReturnType<typeof setInterval> | undefined;
  current: Promise<void>;
  isRunning: boolean;
  isStopped: boolean;
  isRequested: boolean;
};

async function runCycle(dependencies: ModelTeamLoopDependencies): Promise<void> {
  const { outage } = dependencies;
  if (outage.isWaiting()) return;
  try {
    await dependencies.cycle();
    outage.handleSuccess();
  } catch (error: unknown) {
    if (outage.handleFailure(error)) return;
    // Só o nome do erro: a mensagem do `fetch` poderia citar a URL e os cabeçalhos.
    dependencies.logger.error(MODEL_TEAM_LOG.DISPATCH_FAILED, { errorName: readErrorName(error) });
  }
}

async function drain(dependencies: ModelTeamLoopDependencies, state: LoopState): Promise<void> {
  state.isRunning = true;
  while (state.isRequested && !state.isStopped) {
    state.isRequested = false;
    await runCycle(dependencies);
  }
  state.isRunning = false;
}

// Laço PRÓPRIO: falha de provedor, de validação ou de teto nunca chega ao passo ao vivo nem a outra simulação (RNF01).
export function createModelTeamLoop(dependencies: ModelTeamLoopDependencies): ModelTeamLoop {
  const state: LoopState = {
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
