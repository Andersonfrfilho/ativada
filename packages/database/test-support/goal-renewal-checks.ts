// Copyright (c) 2026 Ada Technology. All rights reserved.
import { createGoalRepository } from '../src/goals/goal.repository.js';
import { createRunBatchRepository } from '../src/run-results/run-batch.repository.js';
import { RUN_KIND, RUN_STATUS } from '../src/runs/run.constant.js';
import { createRunRepository } from '../src/runs/run.repository.js';
import type { LifecycleCheckContext } from './account-lifecycle-checks.js';
import { resolvePersistenceOwner, seedRun } from './persistence-seed.js';

const HOUR = 3_600_000;

async function finishWithGoal(
  context: LifecycleCheckContext,
  subject: string,
): Promise<{
  readonly runId: string;
  readonly goalId: string;
  readonly renew: () => Promise<string | undefined>;
}> {
  const owner = await resolvePersistenceOwner(context.handle, subject);
  const created = await createGoalRepository(context.handle).createGoal(owner.scope, {
    symbol: 'BTCUSDT',
    targetRate: '0.03',
    horizonDays: 7,
    maxLossRate: '0.05',
    maxGoals: 20,
  });
  if (created.outcome !== 'created') throw new Error('meta não criada');
  const goalId = created.goal.id;
  const run = await seedRun(context.handle, owner, { kind: RUN_KIND.LIVE_PAPER, goalId });
  const runs = createRunRepository(context.handle);
  await runs.transitionRun(owner.scope, { runId: run.id, to: RUN_STATUS.RUNNING });
  await runs.transitionRun(owner.scope, { runId: run.id, to: RUN_STATUS.COMPLETED });
  const renew = async (): Promise<string | undefined> =>
    (await createRunBatchRepository(context.handle).runInBatch(owner.scope, run.id, (writer) =>
      writer.renewGoalRun(HOUR),
    )) ?? undefined;
  return { runId: run.id, goalId, renew };
}

async function checkRenewal(context: LifecycleCheckContext): Promise<void> {
  const { handle, assertCondition, reportCheck } = context;
  const subject = 'subject-goal-renewal';
  const finished = await finishWithGoal(context, subject);
  const owner = await resolvePersistenceOwner(handle, subject);
  await createGoalRepository(handle).updateGoal(owner.scope, finished.goalId, {
    targetRate: '0.04',
  });
  const renewedId = await finished.renew();
  assertCondition(renewedId !== undefined, 'a simulação concluída pela meta ganha sucessora');
  assertCondition((await finished.renew()) === undefined, 'a renovação acontece uma vez só');
  const renewed = await createRunRepository(handle).findRun(owner.scope, renewedId ?? '');
  const request = JSON.stringify(renewed?.request ?? null);
  assertCondition(
    renewed?.status === RUN_STATUS.QUEUED &&
      renewed.goalId === finished.goalId &&
      renewed.periodStart % HOUR === 0 &&
      request.includes('"targetRate":"0.04"') &&
      request.includes(finished.runId),
    `a sucessora nasce na fila, com a meta atual e o elo para a anterior (${request})`,
  );
  reportCheck('renovação da meta: sucessora na fila, meta atual, uma vez por simulação');
}

async function checkInactiveGoal(context: LifecycleCheckContext): Promise<void> {
  const { handle, assertCondition, reportCheck } = context;
  const subject = 'subject-goal-renewal-off';
  const finished = await finishWithGoal(context, subject);
  const owner = await resolvePersistenceOwner(handle, subject);
  await createGoalRepository(handle).updateGoal(owner.scope, finished.goalId, { isActive: false });
  assertCondition((await finished.renew()) === undefined, 'meta desativada não renova');
  reportCheck('renovação da meta: desativar a meta encerra o ciclo');
}

export async function checkGoalRenewal(context: LifecycleCheckContext): Promise<void> {
  await checkRenewal(context);
  await checkInactiveGoal(context);
}
