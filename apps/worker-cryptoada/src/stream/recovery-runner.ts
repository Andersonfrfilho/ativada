// Copyright (c) 2026 Ada Technology. All rights reserved.
import { computeBackoffDelay } from '@cryptoada/market-data';

import type { WorkerLogger } from '../logging/worker-logger.js';
import { WORKER_LOG } from '../worker.constant.js';

export type RecoveryRunnerDependencies = {
  readonly recover: () => Promise<number>;
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

// Uma recuperação por vez; reconexão nova substitui a anterior e falha agenda nova tentativa com backoff.
export function createRecoveryRunner(dependencies: RecoveryRunnerDependencies): RecoveryRunner {
  let generation = 0;
  let isStopped = false;
  let queue: Promise<void> = Promise.resolve();
  let notifyStopped: () => void = () => undefined;
  const stoppedSignal = new Promise<void>((resolve) => {
    notifyStopped = resolve;
  });

  function reportUnexpectedFailure(error: unknown): void {
    dependencies.logger.error(WORKER_LOG.GAP_RECOVERY_FAILED, {
      errorName: error instanceof Error ? error.name : 'UnknownError',
    });
  }

  async function runUntilDone(ownGeneration: number): Promise<void> {
    for (let attempt = 0; !isStopped && ownGeneration === generation; attempt += 1) {
      const failures = await dependencies.recover();
      if (failures === 0) {
        dependencies.logger.info(WORKER_LOG.GAP_RECOVERY_FINISHED, { attempts: attempt + 1 });
        return;
      }
      const delay = computeBackoffDelay({
        attempt,
        baseMilliseconds: dependencies.backoffBaseMilliseconds,
        maxMilliseconds: dependencies.backoffMaxMilliseconds,
        random: dependencies.random,
      });
      dependencies.logger.warn(WORKER_LOG.GAP_RECOVERY_RETRY, {
        attempt: attempt + 1,
        delayMs: delay,
      });
      await Promise.race([dependencies.sleep(delay), stoppedSignal]);
    }
  }

  return {
    trigger: (): void => {
      if (isStopped) return;
      generation += 1;
      const ownGeneration = generation;
      queue = queue.then(() => runUntilDone(ownGeneration)).catch(reportUnexpectedFailure);
    },
    stop: async (): Promise<void> => {
      isStopped = true;
      notifyStopped();
      await queue;
    },
  };
}
