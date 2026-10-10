// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, test } from 'bun:test';

import type {
  ClaimedRun,
  ReclaimResult,
} from '../packages/database/src/run-queue/run-queue.types.js';
import { RUN_ORPHAN_POLICY } from '../packages/database/src/run-queue/run-queue.constant.js';
import { RUN_KIND, type RunKind } from '../packages/database/src/runs/run.constant.js';
import { loadApiApp } from './fixtures/api-routes/api-app.fixture.js';

const app = await loadApiApp();
const INSTANCE_ID = 'instance-under-test';
const HEARTBEAT_INTERVAL = 15_000;
const POLL_INTERVAL = 2_000;
const TIMEOUT_SECONDS = 60;

type Deferred = {
  readonly runId: string;
  readonly finish: () => void;
  readonly fail: (e: Error) => void;
};

type Interval = {
  readonly milliseconds: number;
  readonly task: () => Promise<void> | void;
  isCancelled: boolean;
};

type Harness = {
  readonly dispatcher: ReturnType<typeof app.runQueueDispatcher.createRunQueueDispatcher>;
  readonly calls: {
    readonly claim: string[];
    readonly renew: { claimedBy: string; runIds: readonly string[] }[];
    readonly reclaim: { heartbeatTimeoutSeconds: number; orphanPolicy: string }[];
    readonly release: string[];
    cancelInactive: number;
    terminate: number;
    readonly reported: unknown[];
  };
  readonly state: {
    lost: readonly string[];
    reclaimResult: ReclaimResult;
    claimFailures: number;
    failReclaim: boolean;
    hangRelease: boolean;
  };
  readonly backlog: ClaimedRun[];
  readonly executions: Deferred[];
  readonly executed: { kind: RunKind; runId: string }[];
  readonly intervals: Interval[];
  readonly tick: (milliseconds: number) => Promise<void>;
};

function build(options: { globalConcurrency?: number; backlog?: ClaimedRun[] } = {}): Harness {
  const backlog: ClaimedRun[] = [...(options.backlog ?? [])];
  const calls = {
    claim: [] as string[],
    renew: [] as { claimedBy: string; runIds: readonly string[] }[],
    reclaim: [] as { heartbeatTimeoutSeconds: number; orphanPolicy: string }[],
    release: [] as string[],
    cancelInactive: 0,
    terminate: 0,
    reported: [] as unknown[],
  };
  const state = {
    lost: [] as readonly string[],
    reclaimResult: { requeued: 0, failed: 0 } as ReclaimResult,
    claimFailures: 0,
    failReclaim: false,
    hangRelease: false,
  };
  const executions: Deferred[] = [];
  const executed: { kind: RunKind; runId: string }[] = [];
  const intervals: {
    milliseconds: number;
    task: () => Promise<void> | void;
    isCancelled: boolean;
  }[] = [];
  const execute =
    (kind: RunKind) =>
    (runId: string): Promise<unknown> => {
      executed.push({ kind, runId });
      return new Promise((resolve, reject) => {
        executions.push({ runId, finish: () => resolve({ status: 'completed' }), fail: reject });
      });
    };
  const dispatcher = app.runQueueDispatcher.createRunQueueDispatcher({
    queue: {
      claimNextRun: ({ claimedBy }) => {
        calls.claim.push(claimedBy);
        if (state.claimFailures > 0) {
          state.claimFailures -= 1;
          return Promise.reject(new Error('banco indisponível'));
        }
        return Promise.resolve(backlog.shift());
      },
      renewHeartbeat: (params) => {
        calls.renew.push(params);
        return Promise.resolve({ held: params.runIds, lost: state.lost });
      },
      reclaimExpiredRuns: (params) => {
        calls.reclaim.push(params);
        if (state.failReclaim) return Promise.reject(new Error('banco indisponível'));
        return Promise.resolve(state.reclaimResult);
      },
      releaseClaimedRuns: ({ claimedBy }) => {
        calls.release.push(claimedBy);
        if (state.hangRelease) return new Promise<number>(() => undefined);
        return Promise.resolve(0);
      },
      cancelRunsOfInactiveOwners: () => {
        calls.cancelInactive += 1;
        return Promise.resolve(0);
      },
    },
    executors: {
      [RUN_KIND.BACKTEST]: execute(RUN_KIND.BACKTEST),
      [RUN_KIND.WALK_FORWARD]: execute(RUN_KIND.WALK_FORWARD),
    },
    terminateExecutors: () => {
      calls.terminate += 1;
      for (const execution of executions) execution.finish();
      return Promise.resolve();
    },
    timers: {
      every: (milliseconds, task) => {
        const entry = { milliseconds, task, isCancelled: false };
        intervals.push(entry);
        return (): void => {
          entry.isCancelled = true;
        };
      },
    },
    config: {
      instanceId: INSTANCE_ID,
      globalConcurrency: options.globalConcurrency ?? 2,
      heartbeatIntervalMilliseconds: HEARTBEAT_INTERVAL,
      heartbeatTimeoutSeconds: TIMEOUT_SECONDS,
      pollIntervalMilliseconds: POLL_INTERVAL,
      releaseTimeoutMilliseconds: 20,
      orphanPolicy: RUN_ORPHAN_POLICY.RESUME_WITH_CHECKPOINT,
    },
    reportUnexpectedError: (error) => calls.reported.push(error),
  });
  async function tick(milliseconds: number): Promise<void> {
    for (const entry of intervals) {
      if (entry.milliseconds === milliseconds && !entry.isCancelled) await entry.task();
    }
    await settle();
  }
  return { dispatcher, calls, state, backlog, executions, executed, intervals, tick };
}

async function settle(): Promise<void> {
  for (let round = 0; round < 5; round += 1) await Bun.sleep(1);
}

function run(runId: string, kind: RunKind = RUN_KIND.BACKTEST): ClaimedRun {
  return { runId, kind };
}

describe('RunQueueDispatcher: despacho', () => {
  test('dispatch NÃO espera a execução terminar e acorda a fila', async () => {
    const harness = build({ backlog: [run('r1')] });
    const winner = await Promise.race([
      harness.dispatcher
        .dispatch({ runId: 'r1', kind: RUN_KIND.BACKTEST })
        .then(() => 'dispatched'),
      Bun.sleep(1_000).then(() => 'blocked'),
    ]);
    expect(winner).toBe('dispatched');
    await settle();
    expect(harness.executed).toStrictEqual([{ kind: RUN_KIND.BACKTEST, runId: 'r1' }]);
    expect(harness.calls.claim[0]).toBe(INSTANCE_ID);
  });

  test('o tipo escolhe o executor: backtest e walk-forward', async () => {
    const harness = build({ backlog: [run('r1'), run('r2', RUN_KIND.WALK_FORWARD)] });
    await harness.dispatcher.dispatch({ runId: 'r1', kind: RUN_KIND.BACKTEST });
    await settle();
    expect(harness.executed).toStrictEqual([
      { kind: RUN_KIND.BACKTEST, runId: 'r1' },
      { kind: RUN_KIND.WALK_FORWARD, runId: 'r2' },
    ]);
  });

  test('tipo sem executor (live_paper) rejeita, para a rota marcar DISPATCH_FAILED', async () => {
    const harness = build();
    const rejection = await harness.dispatcher
      .dispatch({ runId: 'r1', kind: RUN_KIND.LIVE_PAPER })
      .then(
        () => undefined,
        (error: unknown) => error,
      );
    expect(rejection).toBeInstanceOf(Error);
    expect(harness.calls.claim).toHaveLength(0);
  });

  test('o teto GLOBAL da instância limita as execuções simultâneas e libera a vaga ao terminar', async () => {
    const harness = build({
      globalConcurrency: 2,
      backlog: [run('r1'), run('r2'), run('r3'), run('r4')],
    });
    await harness.dispatcher.dispatch({ runId: 'r1', kind: RUN_KIND.BACKTEST });
    await settle();
    expect(harness.executed.map((entry) => entry.runId)).toStrictEqual(['r1', 'r2']);
    expect(harness.dispatcher.activeCount()).toBe(2);
    harness.executions[0]?.finish();
    await settle();
    expect(harness.executed.map((entry) => entry.runId)).toStrictEqual(['r1', 'r2', 'r3']);
    expect(harness.dispatcher.activeCount()).toBe(2);
  });

  test('execução que rejeita é reportada e a vaga volta para a fila', async () => {
    const harness = build({ globalConcurrency: 1, backlog: [run('r1'), run('r2')] });
    await harness.dispatcher.dispatch({ runId: 'r1', kind: RUN_KIND.BACKTEST });
    await settle();
    harness.executions[0]?.fail(new Error('executor caiu'));
    await settle();
    expect(harness.calls.reported).toHaveLength(1);
    expect(harness.executed.map((entry) => entry.runId)).toStrictEqual(['r1', 'r2']);
  });

  test('falha ao reivindicar é reportada e a próxima ronda tenta de novo', async () => {
    const harness = build({ backlog: [run('r1')] });
    harness.state.claimFailures = 1;
    await harness.dispatcher.start();
    await settle();
    expect(harness.calls.reported).toHaveLength(1);
    expect(harness.executed).toHaveLength(0);
    await harness.tick(POLL_INTERVAL);
    expect(harness.executed.map((entry) => entry.runId)).toStrictEqual(['r1']);
  });
});

describe('RunQueueDispatcher: boot', () => {
  test('recupera as órfãs com a política configurada, cancela as de contas inativas e REDESPACHA a fila durável', async () => {
    const harness = build({ backlog: [run('queued-1'), run('queued-2', RUN_KIND.WALK_FORWARD)] });
    await harness.dispatcher.start();
    await settle();
    expect(harness.calls.reclaim).toStrictEqual([
      {
        heartbeatTimeoutSeconds: TIMEOUT_SECONDS,
        orphanPolicy: RUN_ORPHAN_POLICY.RESUME_WITH_CHECKPOINT,
      },
    ]);
    expect(harness.calls.cancelInactive).toBe(1);
    expect(harness.executed.map((entry) => entry.runId)).toStrictEqual(['queued-1', 'queued-2']);
  });

  test('falha na recuperação do boot é reportada e NÃO impede a fila de andar', async () => {
    const harness = build({ backlog: [run('queued-1')] });
    harness.state.failReclaim = true;
    await harness.dispatcher.start();
    await settle();
    expect(harness.calls.reported).toHaveLength(1);
    expect(harness.executed.map((entry) => entry.runId)).toStrictEqual(['queued-1']);
  });

  test('registra o batimento e a ronda periódica', async () => {
    const harness = build();
    await harness.dispatcher.start();
    expect(
      harness.intervals.map((entry) => entry.milliseconds).sort((a, b) => a - b),
    ).toStrictEqual([POLL_INTERVAL, HEARTBEAT_INTERVAL]);
  });
});

describe('RunQueueDispatcher: batimento e órfãs', () => {
  test('a cada batimento renova SÓ as execuções vivas desta instância', async () => {
    const harness = build({ backlog: [run('r1'), run('r2')] });
    await harness.dispatcher.start();
    await settle();
    await harness.tick(HEARTBEAT_INTERVAL);
    expect(harness.calls.renew).toStrictEqual([{ claimedBy: INSTANCE_ID, runIds: ['r1', 'r2'] }]);
    harness.executions[0]?.finish();
    await settle();
    await harness.tick(HEARTBEAT_INTERVAL);
    expect(harness.calls.renew.at(-1)?.runIds).toStrictEqual(['r2']);
  });

  test('sem execução viva não há o que renovar', async () => {
    const harness = build();
    await harness.dispatcher.start();
    await harness.tick(HEARTBEAT_INTERVAL);
    expect(harness.calls.renew).toHaveLength(0);
  });

  test('perder a posse (outra instância recuperou a órfã) é reportado', async () => {
    const harness = build({ backlog: [run('r1')] });
    await harness.dispatcher.start();
    await settle();
    harness.state.lost = ['r1'];
    await harness.tick(HEARTBEAT_INTERVAL);
    expect(harness.calls.reported).toHaveLength(1);
  });

  test('a ronda periódica recupera órfãs, cancela contas inativas e reivindica o que chegou', async () => {
    const harness = build();
    await harness.dispatcher.start();
    await settle();
    harness.backlog.push(run('late'));
    await harness.tick(POLL_INTERVAL);
    expect(harness.calls.reclaim).toHaveLength(2);
    expect(harness.calls.cancelInactive).toBe(2);
    expect(harness.executed.map((entry) => entry.runId)).toStrictEqual(['late']);
  });
});

describe('RunQueueDispatcher: encerramento', () => {
  test('stop: para de reivindicar, termina as threads, espera e DEVOLVE à fila as desta instância', async () => {
    const harness = build({ backlog: [run('r1'), run('r2'), run('r3')], globalConcurrency: 2 });
    await harness.dispatcher.start();
    await settle();
    await harness.dispatcher.stop();
    expect(harness.calls.terminate).toBe(1);
    expect(harness.calls.release).toStrictEqual([INSTANCE_ID]);
    expect(harness.executed.map((entry) => entry.runId)).toStrictEqual(['r1', 'r2']);
    expect(harness.intervals.every((entry) => entry.isCancelled)).toBe(true);
    expect(harness.dispatcher.activeCount()).toBe(0);
  });

  test('stop não espera para sempre um banco que não responde: reporta e termina', async () => {
    const harness = build({ backlog: [run('r1')], globalConcurrency: 1 });
    await harness.dispatcher.start();
    await settle();
    harness.state.hangRelease = true;
    const winner = await Promise.race([
      harness.dispatcher.stop().then(() => 'stopped'),
      Bun.sleep(1_000).then(() => 'hung'),
    ]);
    expect(winner).toBe('stopped');
    expect(harness.calls.release).toStrictEqual([INSTANCE_ID]);
    expect(harness.calls.reported).toHaveLength(1);
  });

  test('depois do stop nada mais é reivindicado, nem por dispatch nem pela ronda', async () => {
    const harness = build({ backlog: [run('r1')], globalConcurrency: 1 });
    await harness.dispatcher.start();
    await settle();
    await harness.dispatcher.stop();
    harness.backlog.push(run('after'));
    await harness.dispatcher.dispatch({ runId: 'after', kind: RUN_KIND.BACKTEST });
    await harness.tick(POLL_INTERVAL);
    expect(harness.executed.map((entry) => entry.runId)).toStrictEqual(['r1']);
  });

  test('abandon simula a morte do processo: termina as threads e NÃO toca a fila', async () => {
    const harness = build({ backlog: [run('r1')] });
    await harness.dispatcher.start();
    await settle();
    await harness.dispatcher.abandon();
    expect(harness.calls.terminate).toBe(1);
    expect(harness.calls.release).toHaveLength(0);
    expect(harness.intervals.every((entry) => entry.isCancelled)).toBe(true);
  });
});

describe('RunQueueDispatcher: o encerramento sobrevive a um banco que não responde', () => {
  test('falha ao devolver as execuções é reportada e o stop termina (o batimento vence e outra instância recupera)', async () => {
    const harness = build({ backlog: [run('r1')] });
    await harness.dispatcher.start();
    await settle();
    const release = harness.dispatcher;
    const failing = app.runQueueDispatcher.createRunQueueDispatcher({
      queue: {
        claimNextRun: () => Promise.resolve(undefined),
        renewHeartbeat: () => Promise.resolve({ held: [], lost: [] }),
        reclaimExpiredRuns: () => Promise.resolve({ requeued: 0, failed: 0 }),
        releaseClaimedRuns: () => Promise.reject(new Error('banco indisponível')),
        cancelRunsOfInactiveOwners: () => Promise.resolve(0),
      },
      executors: {},
      terminateExecutors: () => Promise.resolve(),
      timers: { every: () => (): void => undefined },
      config: {
        instanceId: INSTANCE_ID,
        globalConcurrency: 1,
        heartbeatIntervalMilliseconds: HEARTBEAT_INTERVAL,
        heartbeatTimeoutSeconds: TIMEOUT_SECONDS,
        pollIntervalMilliseconds: POLL_INTERVAL,
        releaseTimeoutMilliseconds: 1000,
        orphanPolicy: RUN_ORPHAN_POLICY.RESUME_WITH_CHECKPOINT,
      },
      reportUnexpectedError: (error) => harness.calls.reported.push(error),
    });
    await failing.stop();
    expect(harness.calls.reported).toHaveLength(1);
    await release.stop();
  });
});
