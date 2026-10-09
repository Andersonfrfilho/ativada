// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { Logger } from './logging/logger.js';

export const SHUTDOWN_TIMEOUT_MILLISECONDS = 10_000;
const SHUTDOWN_SIGNALS: readonly NodeJS.Signals[] = ['SIGTERM', 'SIGINT'];

export type ShutdownParams = {
  readonly stopServer: () => Promise<void>;
  readonly closeResources: () => Promise<void>;
  readonly logger: Logger;
  readonly timeoutMilliseconds: number;
  readonly exit: (code: number) => void;
};

export function createShutdownHandler(params: ShutdownParams): (signal: string) => Promise<void> {
  let isShuttingDown = false;

  return async (signal) => {
    if (isShuttingDown) return;
    isShuttingDown = true;
    params.logger.info('shutdown started', { signal });
    const safetyTimer = setTimeout(() => {
      params.logger.error('shutdown timed out', { timeoutMs: params.timeoutMilliseconds });
      params.exit(1);
    }, params.timeoutMilliseconds);
    try {
      await params.stopServer();
      await params.closeResources();
      clearTimeout(safetyTimer);
      params.logger.info('shutdown complete');
      params.exit(0);
    } catch (error: unknown) {
      clearTimeout(safetyTimer);
      params.logger.error('shutdown failed', { error });
      params.exit(1);
    }
  };
}

export function registerShutdownSignals(shutdown: (signal: string) => Promise<void>): void {
  for (const signal of SHUTDOWN_SIGNALS) {
    process.on(signal, () => void shutdown(signal));
  }
}
