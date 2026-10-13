// Copyright (c) 2026 Ada Technology. All rights reserved.
import { readErrorName } from '@ativada/environment';

import type { WorkerLogger } from '../logging/worker-logger.js';
import type { LoopOutageGuard } from '../outage/loop-outage-guard.js';
import { WORKER_LOG } from '../worker.constant.js';

export type HeartbeatLoop = {
  readonly start: () => void;
  // Para o laço e espera a batida que estiver no ar; depois disso nenhuma batida nova sai.
  readonly stop: () => Promise<void>;
};

export type HeartbeatLoopDependencies = {
  readonly recordBeat: () => Promise<void>;
  readonly logger: WorkerLogger;
  readonly intervalMilliseconds: number;
  // Banco fora: a batida espera o backoff do porteiro e a queda sai resumida, sem erro cru.
  readonly outage: LoopOutageGuard;
};

async function beat(dependencies: HeartbeatLoopDependencies): Promise<void> {
  const { outage } = dependencies;
  if (outage.isWaiting()) return;
  try {
    await dependencies.recordBeat();
    outage.handleSuccess();
  } catch (error: unknown) {
    if (outage.handleFailure(error)) return;
    dependencies.logger.error(WORKER_LOG.HEARTBEAT_FAILED, { errorName: readErrorName(error) });
  }
}

export function createHeartbeatLoop(dependencies: HeartbeatLoopDependencies): HeartbeatLoop {
  let timer: ReturnType<typeof setInterval> | undefined;
  let current: Promise<void> = Promise.resolve();
  let isBeating = false;
  let isStopped = false;
  const tick = (): void => {
    if (isStopped || isBeating) return;
    isBeating = true;
    current = beat(dependencies).finally(() => {
      isBeating = false;
    });
  };
  return {
    start: (): void => {
      timer = setInterval(tick, dependencies.intervalMilliseconds);
      tick();
    },
    stop: async (): Promise<void> => {
      isStopped = true;
      if (timer !== undefined) clearInterval(timer);
      await current;
    },
  };
}
