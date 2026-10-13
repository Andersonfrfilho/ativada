// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { RunStallRepository } from '@ativada/database';
import { readErrorName } from '@ativada/environment';

import type { Logger } from '../../logging/logger.js';
import type { IntervalTimers } from '../queue/run-queue-dispatcher.types.js';
import { sweepStalls } from './stall-sweeper.js';

export const STALL_SWEEP_LOG = {
  CHANGED: 'stall sweep changed runs',
  FAILED: 'stall sweep failed',
} as const;

// A parte da guarda de queda do banco que o laço usa: o resumo de uma linha por minuto mora nela.
export type StallSweepOutage = {
  readonly isWaiting: () => boolean;
  readonly handleFailure: (error: unknown) => boolean;
  readonly handleSuccess: () => void;
};

export type StallSweepLoopDependencies = {
  readonly store: RunStallRepository;
  readonly timers: IntervalTimers;
  readonly logger: Logger;
  readonly outage: StallSweepOutage;
  readonly now: () => number;
  readonly graceMinutes: number;
  readonly intervalMilliseconds: number;
};

export type StallSweepLoop = {
  readonly start: () => void;
  // Para o laço e espera a ronda que estiver no ar.
  readonly stop: () => Promise<void>;
  readonly runOnce: () => Promise<void>;
};

async function runRound(dependencies: StallSweepLoopDependencies): Promise<void> {
  const { outage, logger } = dependencies;
  if (outage.isWaiting()) return;
  try {
    const summary = await dependencies.store.inTransaction((session) =>
      sweepStalls({
        session,
        now: dependencies.now(),
        graceMinutes: dependencies.graceMinutes,
      }),
    );
    outage.handleSuccess();
    if (summary.opened + summary.closed > 0) {
      logger.info(STALL_SWEEP_LOG.CHANGED, { opened: summary.opened, closed: summary.closed });
    }
  } catch (error: unknown) {
    if (outage.handleFailure(error)) return;
    logger.error(STALL_SWEEP_LOG.FAILED, { errorName: readErrorName(error) });
  }
}

export function createStallSweepLoop(dependencies: StallSweepLoopDependencies): StallSweepLoop {
  let stopTimer: (() => void) | undefined;
  let current: Promise<void> = Promise.resolve();
  let isRunning = false;
  // Uma ronda por vez: a que ainda roda faz a seguinte esperar o próximo intervalo.
  const runOnce = (): Promise<void> => {
    if (isRunning) return current;
    isRunning = true;
    current = runRound(dependencies).finally(() => {
      isRunning = false;
    });
    return current;
  };
  return {
    start: (): void => {
      stopTimer = dependencies.timers.every(dependencies.intervalMilliseconds, runOnce);
      void runOnce();
    },
    stop: async (): Promise<void> => {
      stopTimer?.();
      stopTimer = undefined;
      await current;
    },
    runOnce,
  };
}
