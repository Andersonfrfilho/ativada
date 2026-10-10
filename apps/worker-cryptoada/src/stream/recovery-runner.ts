// Copyright (c) 2026 Ada Technology. All rights reserved.
import { MILLISECONDS_PER_SECOND, readErrorName } from '@cryptoada/environment';
import { computeBackoffDelay } from '@cryptoada/market-data';

import type { WorkerLogger } from '../logging/worker-logger.js';
import { BAN_SLEEP_SLICE_MILLISECONDS, WORKER_LOG } from '../worker.constant.js';
import type { RecoveryOutcome } from './gap-recovery.js';

export type { RecoveryOutcome } from './gap-recovery.js';

export type RecoveryRunnerDependencies = {
  readonly recover: () => Promise<RecoveryOutcome>;
  readonly logger: WorkerLogger;
  readonly sleep: (milliseconds: number) => Promise<void>;
  readonly random: () => number;
  readonly backoffBaseMilliseconds: number;
  readonly backoffMaxMilliseconds: number;
};

export type RecoveryRunner = {
  readonly trigger: () => void;
  readonly stop: () => Promise<void>;
};

type RunnerState = {
  generation: number;
  isStopped: boolean;
  banRemainingMilliseconds: number;
  queue: Promise<void>;
};

type RunnerContext = {
  readonly dependencies: RecoveryRunnerDependencies;
  readonly state: RunnerState;
  readonly stoppedSignal: Promise<void>;
};

function isCurrent(context: RunnerContext, ownGeneration: number): boolean {
  return !context.state.isStopped && ownGeneration === context.state.generation;
}

// Em fatias: o encerramento acorda a espera, e o ban vale para qualquer execução seguinte.
async function waitOutBan(context: RunnerContext, ownGeneration: number): Promise<void> {
  const { state, dependencies, stoppedSignal } = context;
  while (state.banRemainingMilliseconds > 0 && isCurrent(context, ownGeneration)) {
    const slice = Math.min(BAN_SLEEP_SLICE_MILLISECONDS, state.banRemainingMilliseconds);
    await Promise.race([dependencies.sleep(slice), stoppedSignal]);
    state.banRemainingMilliseconds -= slice;
  }
}

function registerBan(context: RunnerContext, banMilliseconds: number): void {
  context.state.banRemainingMilliseconds = banMilliseconds;
  context.dependencies.logger.warn(WORKER_LOG.GAP_RECOVERY_BANNED, {
    sleepSeconds: Math.ceil(banMilliseconds / MILLISECONDS_PER_SECOND),
  });
}

async function waitBeforeRetry(context: RunnerContext, attempt: number): Promise<void> {
  const { dependencies, stoppedSignal } = context;
  const delay = computeBackoffDelay({
    attempt,
    baseMilliseconds: dependencies.backoffBaseMilliseconds,
    maxMilliseconds: dependencies.backoffMaxMilliseconds,
    random: dependencies.random,
  });
  dependencies.logger.warn(WORKER_LOG.GAP_RECOVERY_RETRY, {
    attempt: attempt + 1,
    delayMilliseconds: delay,
  });
  await Promise.race([dependencies.sleep(delay), stoppedSignal]);
}

async function runUntilDone(context: RunnerContext, ownGeneration: number): Promise<void> {
  const { dependencies } = context;
  for (let attempt = 0; isCurrent(context, ownGeneration); attempt += 1) {
    await waitOutBan(context, ownGeneration);
    if (!isCurrent(context, ownGeneration)) return;
    const outcome = await dependencies.recover();
    if (outcome.failures === 0) {
      dependencies.logger.info(WORKER_LOG.GAP_RECOVERY_FINISHED, { attempts: attempt + 1 });
      return;
    }
    if (outcome.banMilliseconds !== undefined) registerBan(context, outcome.banMilliseconds);
    else await waitBeforeRetry(context, attempt);
  }
}

export function createRecoveryRunner(dependencies: RecoveryRunnerDependencies): RecoveryRunner {
  let notifyStopped: () => void = () => undefined;
  const stoppedSignal = new Promise<void>((resolve) => {
    notifyStopped = resolve;
  });
  const state: RunnerState = {
    generation: 0,
    isStopped: false,
    banRemainingMilliseconds: 0,
    queue: Promise.resolve(),
  };
  const context: RunnerContext = { dependencies, state, stoppedSignal };
  const reportUnexpectedFailure = (error: unknown): void => {
    dependencies.logger.error(WORKER_LOG.GAP_RECOVERY_FAILED, { errorName: readErrorName(error) });
  };
  return {
    trigger: (): void => {
      if (state.isStopped) return;
      state.generation += 1;
      const ownGeneration = state.generation;
      state.queue = state.queue
        .then(() => runUntilDone(context, ownGeneration))
        .catch(reportUnexpectedFailure);
    },
    stop: async (): Promise<void> => {
      state.isStopped = true;
      notifyStopped();
      await state.queue;
    },
  };
}
