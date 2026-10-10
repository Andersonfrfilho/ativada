// Copyright (c) 2026 Ada Technology. All rights reserved.
import { RUN_ORPHAN_POLICY } from '../../packages/database/src/index.js';
import { readPersistedRun } from '../backtest-test/read-run-rows.js';
import {
  assertCondition,
  createTestDispatcher,
  enqueueBacktest,
  reportLine,
  type QueueTestContext,
} from './queue-test-context.js';
import { readTimes, sampleUntilFinished, waitFor } from './run-timeline.js';

type CheckpointRow = { readonly last_candle_time: string | null };

async function hasCheckpoint(context: QueueTestContext, runId: string): Promise<boolean> {
  const rows: unknown = await context.client.unsafe(
    "SELECT last_candle_time FROM runs WHERE id = $1 AND status = 'running'",
    [runId],
  );
  return (rows as readonly CheckpointRow[])[0]?.last_candle_time != null;
}

// (iv) A instância morre no meio: o batimento vence, outra instância recupera a órfã do checkpoint e o resultado é
// IDÊNTICO ao da execução contínua.
export async function checkCrashRecovery(context: QueueTestContext): Promise<void> {
  const owner = context.backtest.owner;
  const strategyVersionId = context.backtest.strategyVersionId;
  const user = { ...owner, classicVersionId: strategyVersionId, walkForwardVersionId: '' };
  const interrupted = await enqueueBacktest(context, { user, window: context.heavy });
  const reported: unknown[] = [];
  const doomed = createTestDispatcher(context, {
    instanceId: 'doomed-instance',
    globalConcurrency: 1,
    reported,
  });
  await doomed.start();
  await waitFor('o checkpoint da execução que vai morrer', () =>
    hasCheckpoint(context, interrupted.id),
  );
  await doomed.abandon();
  const orphan = await readTimes(context, interrupted.id);
  assertCondition(
    orphan.status === 'running' && orphan.claimedBy === 'doomed-instance',
    `depois da queda a execução segue running e presa à instância morta (${orphan.status})`,
  );
  const rescuer = createTestDispatcher(context, {
    instanceId: 'rescuer-instance',
    globalConcurrency: 1,
    orphanPolicy: RUN_ORPHAN_POLICY.RESUME_WITH_CHECKPOINT,
    reported,
  });
  await rescuer.start();
  await sampleUntilFinished(context, [interrupted.id]);
  const reference = await enqueueBacktest(context, { user, window: context.heavy });
  await sampleUntilFinished(context, [reference.id]);
  await rescuer.stop();
  const resumed = await readPersistedRun(context.backtest, interrupted.id);
  const continuous = await readPersistedRun(context.backtest, reference.id);
  assertCondition(resumed.status === 'completed', `retomada terminou ${resumed.status}`);
  assertCondition(
    resumed.digest === continuous.digest,
    'a execução retomada do checkpoint difere da contínua',
  );
  assertCondition(reported.length === 0, `reportado: ${String(reported[0])}`);
  reportLine(
    `(iv) queda no meio: batimento vencido -> outra instância retomou do checkpoint e o resultado é IDÊNTICO ao da execução contínua (digest ${resumed.digest})`,
  );
}
