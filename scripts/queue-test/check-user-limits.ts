// Copyright (c) 2026 Ada Technology. All rights reserved.
import {
  assertCondition,
  createQueueUser,
  createTestDispatcher,
  enqueueWalkForward,
  reportLine,
  type QueueTestContext,
} from './queue-test-context.js';
import { countWhere, readTimes, sampleUntilFinished } from './run-timeline.js';

// (i) O segundo walk-forward do MESMO usuário espera enquanto o primeiro roda; o de OUTRO usuário roda na hora.
export async function checkUserLimits(context: QueueTestContext): Promise<void> {
  const ana = await createQueueUser(context, 'limits-ana');
  const bia = await createQueueUser(context, 'limits-bia');
  const first = await enqueueWalkForward(context, ana);
  const second = await enqueueWalkForward(context, ana);
  const other = await enqueueWalkForward(context, bia);
  const reported: unknown[] = [];
  const dispatcher = createTestDispatcher(context, {
    instanceId: 'limits-instance',
    globalConcurrency: 3,
    reported,
  });
  await dispatcher.start();
  const ids = [first.id, second.id, other.id];
  const snapshots = await sampleUntilFinished(context, ids);
  await dispatcher.stop();
  const waited = countWhere(
    snapshots,
    (snapshot) =>
      snapshot[first.id] === 'running' &&
      snapshot[second.id] === 'queued' &&
      snapshot[other.id] === 'running',
  );
  assertCondition(
    waited > 0,
    'com o 1º walk-forward de Ana rodando, o 2º esperou e o de Bia rodou AO MESMO TEMPO',
  );
  const together = countWhere(
    snapshots,
    (snapshot) => snapshot[first.id] === 'running' && snapshot[second.id] === 'running',
  );
  assertCondition(together === 0, 'os dois walk-forwards de Ana nunca rodaram juntos');
  const [firstTimes, secondTimes] = await Promise.all([
    readTimes(context, first.id),
    readTimes(context, second.id),
  ]);
  assertCondition(
    secondTimes.startedMicros !== undefined &&
      firstTimes.finishedMicros !== undefined &&
      secondTimes.startedMicros >= firstTimes.finishedMicros,
    'o 2º começou depois de o 1º terminar',
  );
  const statuses = ids.map((id) => snapshots.at(-1)?.[id]);
  assertCondition(
    statuses.every((status) => status === 'completed'),
    `estados: ${statuses.join()}`,
  );
  assertCondition(reported.length === 0, `reportado: ${String(reported[0])}`);
  reportLine(
    `(i) teto por usuário: o 2º walk-forward de Ana esperou ${waited} amostras de 25 ms com o 1º rodando e o de Bia rodando junto; nunca dois de Ana ao mesmo tempo; o 2º começou depois de o 1º terminar`,
  );
}
