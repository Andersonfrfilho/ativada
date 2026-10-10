// Copyright (c) 2026 Ada Technology. All rights reserved.
import { createRunQueueRepository } from '../src/run-queue/run-queue.repository.js';
import { RUN_STATUS } from '../src/runs/run.constant.js';
import { createRunRepository } from '../src/runs/run.repository.js';
import type { LifecycleCheckContext } from './account-lifecycle-checks.js';
import { createQueueOwner, enqueueRuns, KIND, resetQueue, setLimits } from './run-queue-seed.js';

const INSTANCE_X = 'instance-x';

async function checkQueuePosition(context: LifecycleCheckContext): Promise<void> {
  const { handle, client, assertCondition, reportCheck } = context;
  await resetQueue(client);
  const queue = createRunQueueRepository(handle);
  const ana = await createQueueOwner(handle, 'subject-queue-position-ana');
  const bia = await createQueueOwner(handle, 'subject-queue-position-bia');
  const [a1] = await enqueueRuns(handle, ana, { kind: KIND.BACKTEST, count: 1 });
  const [b1] = await enqueueRuns(handle, bia, { kind: KIND.WALK_FORWARD, count: 1 });
  const [a2] = await enqueueRuns(handle, ana, { kind: KIND.BACKTEST, count: 1 });
  const [b2] = await enqueueRuns(handle, bia, { kind: KIND.BACKTEST, count: 1 });
  const [a3] = await enqueueRuns(handle, ana, { kind: KIND.WALK_FORWARD, count: 1 });
  const positionOf = (
    owner: typeof ana,
    runId: string | undefined,
  ): ReturnType<typeof queue.findQueuePosition> =>
    queue.findQueuePosition(owner.scope, runId ?? '');
  assertCondition(Bun.deepEquals(await positionOf(ana, a1), { own: 1, overall: 1 }), 'a1');
  assertCondition(Bun.deepEquals(await positionOf(bia, b1), { own: 1, overall: 2 }), 'b1');
  assertCondition(Bun.deepEquals(await positionOf(ana, a2), { own: 2, overall: 3 }), 'a2');
  assertCondition(Bun.deepEquals(await positionOf(bia, b2), { own: 2, overall: 4 }), 'b2');
  assertCondition(Bun.deepEquals(await positionOf(ana, a3), { own: 3, overall: 5 }), 'a3');
  assertCondition((await positionOf(bia, a1)) === undefined, 'a execução de A não existe para B');
  assertCondition((await positionOf(ana, crypto.randomUUID())) === undefined, 'inexistente');
  const hidden = await positionOf(bia, b2);
  assertCondition(
    hidden !== undefined && Object.keys(hidden).sort().join() === 'overall,own',
    'só dois números, sem dado de outro usuário',
  );
  await setLimits(client, ana, { maxConcurrentBacktests: 100 });
  await queue.claimNextRun({ claimedBy: INSTANCE_X });
  assertCondition((await positionOf(ana, a1)) === undefined, 'running não tem posição');
  assertCondition(Bun.deepEquals(await positionOf(ana, a2), { own: 1, overall: 2 }), 'avança');
  await createRunRepository(handle).transitionRun(ana.scope, {
    runId: a3 ?? '',
    to: RUN_STATUS.CANCELLED,
  });
  assertCondition((await positionOf(ana, a3)) === undefined, 'cancelada sai da fila');
  assertCondition(
    Bun.deepEquals(await positionOf(bia, b2), { own: 2, overall: 3 }),
    'e libera a vaga',
  );
  reportCheck(
    'posição na fila: a do dono entre as dele e a global só como número; nada de outro usuário',
  );
}

async function checkCountsAndSummary(context: LifecycleCheckContext): Promise<void> {
  const { handle, client, assertCondition, reportCheck } = context;
  await resetQueue(client);
  const queue = createRunQueueRepository(handle);
  const ana = await createQueueOwner(handle, 'subject-queue-count-ana');
  const bia = await createQueueOwner(handle, 'subject-queue-count-bia');
  await enqueueRuns(handle, ana, { kind: KIND.BACKTEST, count: 3 });
  await enqueueRuns(handle, ana, { kind: KIND.LIVE_PAPER, count: 2 });
  await enqueueRuns(handle, bia, { kind: KIND.BACKTEST, count: 4 });
  await enqueueRuns(handle, bia, { kind: KIND.LIVE_PAPER, count: 1 });
  await createRunRepository(handle).transitionRun(ana.scope, {
    runId: (await enqueueRuns(handle, ana, { kind: KIND.LIVE_PAPER, count: 1 }))[0] ?? '',
    to: RUN_STATUS.RUNNING,
  });
  assertCondition(
    (await queue.countQueuedRuns(ana.scope)) === 3,
    'A tem 3 na fila (a ao vivo não conta)',
  );
  assertCondition(
    (await queue.countQueuedRuns(bia.scope)) === 4,
    'B tem 4 na fila (a ao vivo não conta)',
  );
  assertCondition(
    (await queue.countActiveRuns(ana.scope, KIND.LIVE_PAPER)) === 3,
    'A: 3 ao vivo ativas',
  );
  assertCondition(
    (await queue.countActiveRuns(bia.scope, KIND.LIVE_PAPER)) === 1,
    'B: 1 ao vivo ativa',
  );
  await setLimits(client, ana, { maxActiveLivePaperRuns: 7 });
  const limits = await queue.readUserRunLimits(ana.scope);
  assertCondition(
    limits.maxActiveLivePaperRuns === 7 &&
      limits.maxConcurrentBacktests === 2 &&
      limits.maxConcurrentWalkForwards === 1,
    'limites do dono, o que falta pelo padrão',
  );
  const summary = await queue.readQueueSummary();
  assertCondition(
    summary.queued === 10 && summary.running === 1,
    `resumo: ${JSON.stringify(summary)}`,
  );
  assertCondition(
    summary.byKind.backtest.queued === 7 && summary.byKind.live_paper.running === 1,
    'por tipo',
  );
  assertCondition(
    !JSON.stringify(summary).includes(ana.userId),
    'o resumo não leva dado de usuário',
  );
  reportCheck(
    'contagens do dono (fila e ao vivo ativas), limites do dono e resumo agregado sem dado de usuário',
  );
}

export async function checkRunQueueReading(context: LifecycleCheckContext): Promise<void> {
  await checkQueuePosition(context);
  await checkCountsAndSummary(context);
}
