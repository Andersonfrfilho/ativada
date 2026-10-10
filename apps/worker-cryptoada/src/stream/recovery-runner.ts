// Copyright (c) 2026 Ada Technology. All rights reserved.
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

export function createRecoveryRunner(dependencies: RecoveryRunnerDependencies): RecoveryRunner {
  let generation = 0;
  let isStopped = false;
  let banRemainingMilliseconds = 0;
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

  function isCurrent(ownGeneration: number): boolean {
    return !isStopped && ownGeneration === generation;
  }

  // Em fatias: o encerramento acorda a espera, e o ban vale para qualquer execução seguinte.
  async function waitOutBan(ownGeneration: number): Promise<void> {
    while (banRemainingMilliseconds > 0 && isCurrent(ownGeneration)) {
      const slice = Math.min(BAN_SLEEP_SLICE_MILLISECONDS, banRemainingMilliseconds);
      await Promise.race([dependencies.sleep(slice), stoppedSignal]);
      banRemainingMilliseconds -= slice;
    }
  }

  async function runUntilDone(ownGeneration: number): Promise<void> {
    for (let attempt = 0; isCurrent(ownGeneration); attempt += 1) {
      await waitOutBan(ownGeneration);
      if (!isCurrent(ownGeneration)) return;
      const outcome = await dependencies.recover();
      if (outcome.failures === 0) {
        dependencies.logger.info(WORKER_LOG.GAP_RECOVERY_FINISHED, { attempts: attempt + 1 });
        return;
      }
      if (outcome.banMilliseconds !== undefined) {
        banRemainingMilliseconds = outcome.banMilliseconds;
        dependencies.logger.warn(WORKER_LOG.GAP_RECOVERY_BANNED, {
          sleepSeconds: Math.ceil(outcome.banMilliseconds / 1_000),
        });
        continue;
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
