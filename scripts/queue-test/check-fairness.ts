// Copyright (c) 2026 Ada Technology. All rights reserved.
import {
  assertCondition,
  createQueueUser,
  createTestDispatcher,
  enqueueBacktest,
  reportLine,
  type QueueTestContext,
} from './queue-test-context.js';
import { readTimes, sampleUntilFinished } from './run-timeline.js';

const BACKLOG = 10;

// (ii) 10 backtests de Ana e 1 de Bia que chegou depois: Bia começa antes da 3ª de Ana (não-inanição).
export async function checkFairness(context: QueueTestContext): Promise<void> {
  const ana = await createQueueUser(context, 'fair-ana');
  const bia = await createQueueUser(context, 'fair-bia');
  const anaRuns = [];
  for (let index = 0; index < BACKLOG; index += 1) {
    anaRuns.push(await enqueueBacktest(context, { user: ana, window: context.light }));
  }
  const biaRun = await enqueueBacktest(context, { user: bia, window: context.light });
  const reported: unknown[] = [];
  const executed: string[] = [];
  const dispatcher = createTestDispatcher(context, {
    instanceId: 'fair-instance',
    globalConcurrency: 1,
    executed,
    reported,
  });
  await dispatcher.start();
  await sampleUntilFinished(context, [...anaRuns.map((run) => run.id), biaRun.id]);
  await dispatcher.stop();
  const biaTimes = await readTimes(context, biaRun.id);
  const thirdOfAna = await readTimes(context, anaRuns[2]?.id ?? '');
  assertCondition(
    biaTimes.startedMicros !== undefined &&
      thirdOfAna.startedMicros !== undefined &&
      biaTimes.startedMicros < thirdOfAna.startedMicros,
    'Bia começou antes da 3ª execução de Ana',
  );
  const position = executed.indexOf(biaRun.id) + 1;
  assertCondition(position === 2, `a execução de Bia foi a ${position}ª (esperada a 2ª)`);
  assertCondition(executed.length === BACKLOG + 1, `execuções: ${executed.length}`);
  assertCondition(reported.length === 0, `reportado: ${String(reported[0])}`);
  reportLine(
    `(ii) justiça: com ${BACKLOG} backtests de Ana na frente, o de Bia (enfileirado depois) foi o ${position}º a começar, antes da 3ª de Ana`,
  );
}
