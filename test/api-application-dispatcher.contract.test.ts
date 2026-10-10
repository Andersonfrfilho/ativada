// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, test } from 'bun:test';

import { RUN_ORPHAN_POLICY } from '../packages/database/src/run-queue/run-queue.constant.js';
import type { ClaimedRun } from '../packages/database/src/run-queue/run-queue.types.js';
import { RUN_KIND } from '../packages/database/src/runs/run.constant.js';
import { loadApiApp } from './fixtures/api-routes/api-app.fixture.js';

const app = await loadApiApp();

type Calls = { backtest: string[]; walkForward: string[]; terminated: string[] };

function build(
  backlog: ClaimedRun[],
  options: { readonly isPending?: boolean } = {},
): {
  readonly calls: Calls;
  readonly dispatcher: ReturnType<typeof app.applicationDispatcher.createApplicationDispatcher>;
} {
  const calls: Calls = { backtest: [], walkForward: [], terminated: [] };
  const pendingExecutions: (() => void)[] = [];
  const dispatcher = app.applicationDispatcher.createApplicationDispatcher({
    environment: {
      RUN_GLOBAL_CONCURRENCY: 3,
      RUN_HEARTBEAT_INTERVAL_SECONDS: 15,
      RUN_HEARTBEAT_TIMEOUT_SECONDS: 60,
      RUN_ORPHAN_POLICY: RUN_ORPHAN_POLICY.FAIL_ALL,
    },
    queue: {
      claimNextRun: () => Promise.resolve(backlog.shift()),
      renewHeartbeat: () => Promise.resolve({ held: [], lost: [] }),
      reclaimExpiredRuns: () => Promise.resolve({ requeued: 0, failed: 0 }),
      releaseClaimedRuns: () => Promise.resolve(0),
      cancelRunsOfInactiveOwners: () => Promise.resolve(0),
    },
    runners: {
      backtestRunner: {
        run: (runId) => {
          calls.backtest.push(runId);
          if (options.isPending === true) {
            return new Promise((resolve) =>
              pendingExecutions.push(() => resolve({ status: 'terminated' } as never)),
            );
          }
          return Promise.resolve({ status: 'completed' } as never);
        },
        terminateAll: () => {
          calls.terminated.push('backtest');
          for (const release of pendingExecutions.splice(0)) release();
          return Promise.resolve();
        },
      },
      walkForwardRunner: {
        run: (runId) => {
          calls.walkForward.push(runId);
          return Promise.resolve({ status: 'completed' } as never);
        },
        terminateAll: () => {
          calls.terminated.push('walk-forward');
          return Promise.resolve();
        },
      },
    },
    reportUnexpectedError: () => undefined,
  });
  return { calls, dispatcher };
}

describe('despachante da aplicação (a ligação entre a fila e as threads)', () => {
  test('backtest vai para o executor de backtest e walk-forward para o de walk-forward', async () => {
    const { calls, dispatcher } = build([
      { runId: 'bt-1', kind: RUN_KIND.BACKTEST },
      { runId: 'wf-1', kind: RUN_KIND.WALK_FORWARD },
    ]);
    await dispatcher.start();
    await Bun.sleep(20);
    expect(calls.backtest).toStrictEqual(['bt-1']);
    expect(calls.walkForward).toStrictEqual(['wf-1']);
    await dispatcher.abandon();
  });

  test('o encerramento derruba as threads dos DOIS executores', async () => {
    const { calls, dispatcher } = build([]);
    await dispatcher.start();
    await dispatcher.stop();
    expect(calls.terminated.sort()).toStrictEqual(['backtest', 'walk-forward']);
  });

  test('o ambiente decide o teto global (3): três rodam juntas e as outras esperam', async () => {
    const backlog = Array.from({ length: 5 }, (_unused, index) => ({
      runId: `r${index}`,
      kind: RUN_KIND.BACKTEST,
    }));
    const { calls, dispatcher } = build(backlog, { isPending: true });
    await dispatcher.start();
    await Bun.sleep(20);
    expect(calls.backtest).toStrictEqual(['r0', 'r1', 'r2']);
    expect(dispatcher.activeCount()).toBe(3);
    await dispatcher.abandon();
  });
});
