// Copyright (c) 2026 Ada Technology. All rights reserved.
import {
  assertCondition,
  createQueueUser,
  createTestDispatcher,
  enqueueBacktest,
  reportLine,
  type QueueTestContext,
} from './queue-test-context.js';
import { readStatuses, readTimes, sampleUntilFinished, waitFor } from './run-timeline.js';

const QUEUED_RUNS = 4;

// (v) A fila é durável: o reinício (encerramento gracioso) não perde nada e devolve a execução em andamento à fila.
export async function checkRestart(context: QueueTestContext): Promise<void> {
  const user = await createQueueUser(context, 'restart-ana');
  const runs = [];
  for (let index = 0; index < QUEUED_RUNS; index += 1) {
    runs.push(await enqueueBacktest(context, { user, window: context.heavy }));
  }
  const runIds = runs.map((run) => run.id);
  const reported: unknown[] = [];
  const executed: string[] = [];
  const before = createTestDispatcher(context, {
    instanceId: 'restart-before',
    globalConcurrency: 1,
    executed,
    reported,
  });
  await before.start();
  await waitFor('a primeira execução começar', async () =>
    Object.values(await readStatuses(context, runIds)).includes('running'),
  );
  await before.stop();
  const afterStop = await readStatuses(context, runIds);
  assertCondition(
    Object.values(afterStop).every((status) => status === 'queued'),
    `no encerramento nada fica running nem se perde: ${JSON.stringify(Object.values(afterStop))}`,
  );
  const released = await readTimes(context, executed[0] ?? '');
  assertCondition(released.claimedBy === null, 'a devolvida não guarda a posse da instância');
  const after = createTestDispatcher(context, {
    instanceId: 'restart-after',
    globalConcurrency: 2,
    executed,
    reported,
  });
  await after.start();
  await sampleUntilFinished(context, runIds);
  await after.stop();
  const finals = Object.values(await readStatuses(context, runIds));
  assertCondition(
    finals.every((status) => status === 'completed'),
    `estados: ${finals.join()}`,
  );
  assertCondition(reported.length === 0, `reportado: ${String(reported[0])}`);
  reportLine(
    `(v) reinício: ${QUEUED_RUNS} execuções na fila; o encerramento gracioso devolveu a em andamento à fila e a nova instância concluiu todas (completed)`,
  );
}
