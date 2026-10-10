// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, test } from 'bun:test';

import { createWorkerLogger } from '../apps/worker-cryptoada/src/logging/worker-logger.js';
import { createShutdownHandler } from '../apps/worker-cryptoada/src/shutdown.js';

const TIMEOUT_MILLISECONDS = 60;

function buildHandler(overrides: {
  readonly stopWork?: () => Promise<void>;
  readonly closeResources?: () => Promise<void>;
}): {
  readonly handle: (signal: string) => Promise<void>;
  readonly exits: number[];
  readonly steps: string[];
} {
  const exits: number[] = [];
  const steps: string[] = [];
  const handle = createShutdownHandler({
    stopWork: async () => {
      steps.push('stopWork');
      await overrides.stopWork?.();
    },
    closeResources: async () => {
      steps.push('closeResources');
      await overrides.closeResources?.();
    },
    logger: createWorkerLogger({ appName: 'worker-cryptoada', write: () => undefined }),
    timeoutMilliseconds: TIMEOUT_MILLISECONDS,
    exit: (code) => void exits.push(code),
  });
  return { handle, exits, steps };
}

describe('worker graceful shutdown', () => {
  test('stops the work, then closes the resources and exits 0', async () => {
    const { handle, exits, steps } = buildHandler({});
    await handle('SIGTERM');
    expect(steps).toStrictEqual(['stopWork', 'closeResources']);
    expect(exits).toStrictEqual([0]);
  });

  test('a second signal while shutting down does nothing', async () => {
    const { handle, exits, steps } = buildHandler({});
    await Promise.all([handle('SIGTERM'), handle('SIGINT')]);
    expect(steps).toStrictEqual(['stopWork', 'closeResources']);
    expect(exits).toStrictEqual([0]);
  });

  test('exits 1 when stopping fails, without closing as if nothing happened', async () => {
    const { handle, exits } = buildHandler({ stopWork: () => Promise.reject(new Error('falha')) });
    await handle('SIGTERM');
    expect(exits).toStrictEqual([1]);
  });

  test('exits 1 by the safety timeout when the work never ends', async () => {
    const { handle, exits } = buildHandler({ stopWork: () => new Promise<void>(() => undefined) });
    void handle('SIGTERM');
    await Bun.sleep(TIMEOUT_MILLISECONDS * 3);
    expect(exits).toStrictEqual([1]);
  });
});
