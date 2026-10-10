// Copyright (c) 2026 Ada Technology. All rights reserved.
import {
  assertCondition,
  createQueueUser,
  createTestDispatcher,
  enqueueBacktest,
  reportLine,
  type QueueTestContext,
} from './queue-test-context.js';
import { readStatuses, sampleUntilFinished } from './run-timeline.js';

const USERS = 3;
const RUNS_PER_USER = 8;

// (iii) Duas instâncias sobre o mesmo banco: nenhuma execução roda duas vezes e nenhuma se perde.
export async function checkTwoInstances(context: QueueTestContext): Promise<void> {
  const runIds: string[] = [];
  for (let user = 0; user < USERS; user += 1) {
    const owner = await createQueueUser(context, `pair-${user}`);
    for (let run = 0; run < RUNS_PER_USER; run += 1) {
      runIds.push((await enqueueBacktest(context, { user: owner, window: context.light })).id);
    }
  }
  const reported: unknown[] = [];
  const executedByFirst: string[] = [];
  const executedBySecond: string[] = [];
  const first = createTestDispatcher(context, {
    instanceId: 'pair-first',
    globalConcurrency: 2,
    executed: executedByFirst,
    reported,
  });
  const second = createTestDispatcher(context, {
    instanceId: 'pair-second',
    globalConcurrency: 2,
    executed: executedBySecond,
    reported,
  });
  await Promise.all([first.start(), second.start()]);
  await sampleUntilFinished(context, runIds);
  await Promise.all([first.stop(), second.stop()]);
  const everything = [...executedByFirst, ...executedBySecond];
  assertCondition(
    new Set(everything).size === everything.length,
    'uma execução foi entregue a duas threads',
  );
  assertCondition(everything.length === runIds.length, `entregues: ${everything.length}`);
  const statuses = Object.values(await readStatuses(context, runIds));
  assertCondition(
    statuses.length === runIds.length && statuses.every((status) => status === 'completed'),
    'nenhuma se perdeu: todas completed',
  );
  assertCondition(
    executedByFirst.length > 0 && executedBySecond.length > 0,
    'as duas instâncias participaram',
  );
  assertCondition(reported.length === 0, `reportado: ${String(reported[0])}`);
  reportLine(
    `(iii) duas instâncias: ${runIds.length} execuções de ${USERS} usuários, cada uma entregue UMA vez (${executedByFirst.length} + ${executedBySecond.length}) e todas completed`,
  );
}
