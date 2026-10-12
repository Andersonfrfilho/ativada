// Copyright (c) 2026 Ada Technology. All rights reserved.
import { readErrorName } from '@ativada/environment';

import type { WorkerLogger } from './logging/worker-logger.js';
import { WORKER_LOG } from './worker.constant.js';

const SHUTDOWN_SIGNALS: readonly NodeJS.Signals[] = ['SIGTERM', 'SIGINT'];

export type ShutdownParams = {
  readonly stopWork: () => Promise<void>;
  readonly closeResources: () => Promise<void>;
  readonly logger: WorkerLogger;
  readonly timeoutMilliseconds: number;
  readonly exit: (code: number) => void;
};

export function createShutdownHandler(params: ShutdownParams): (signal: string) => Promise<void> {
  let isShuttingDown = false;

  return async (signal) => {
    if (isShuttingDown) return;
    isShuttingDown = true;
    params.logger.info(WORKER_LOG.SHUTDOWN_STARTED, { signal });
    const safetyTimer = setTimeout(() => {
      params.logger.error(WORKER_LOG.SHUTDOWN_TIMED_OUT, {
        timeoutMilliseconds: params.timeoutMilliseconds,
      });
      params.exit(1);
    }, params.timeoutMilliseconds);
    try {
      await params.stopWork();
      await params.closeResources();
      clearTimeout(safetyTimer);
      params.logger.info(WORKER_LOG.SHUTDOWN_COMPLETE);
      params.exit(0);
    } catch (error: unknown) {
      clearTimeout(safetyTimer);
      params.logger.error(WORKER_LOG.SHUTDOWN_FAILED, {
        errorName: readErrorName(error),
      });
      params.exit(1);
    }
  };
}

export function registerShutdownSignals(shutdown: (signal: string) => Promise<void>): void {
  for (const signal of SHUTDOWN_SIGNALS) {
    process.on(signal, () => void shutdown(signal));
  }
}
