// Copyright (c) 2026 Ada Technology. All rights reserved.
import { ALERT_SIDE } from '../src/alerts/alert.constant.js';
import { GOAL_DELETE_OUTCOME, GOAL_RUN_OUTCOME } from '../src/goals/goal.constant.js';
import { createGoalRepository } from '../src/goals/goal.repository.js';
import { FOREIGN_KEY_VIOLATION_SQLSTATE } from '../src/postgres-error-code.js';
import { createRunBatchRepository } from '../src/run-results/run-batch.repository.js';
import { RUN_KIND, RUN_STATUS } from '../src/runs/run.constant.js';
import { createRunRepository } from '../src/runs/run.repository.js';
import type { LifecycleCheckContext } from './account-lifecycle-checks.js';
import {
  buildRunParams,
  captureErrorCode,
  hashOf,
  resolvePersistenceOwner,
  seedRun,
  seedStrategyVersion,
} from './persistence-seed.js';

const CHECK_VIOLATION_SQLSTATE = '23514';
const GOAL = {
  symbol: 'BTCUSDT',
  targetRate: '0.03',
  horizonDays: 30,
  maxLossRate: '0.05',
  maxGoals: 20,
} as const;

async function newGoalId(context: LifecycleCheckContext, subject: string): Promise<string> {
  const owner = await resolvePersistenceOwner(context.handle, subject);
  const created = await createGoalRepository(context.handle).createGoal(owner.scope, GOAL);
  if (created.outcome !== 'created') throw new Error('meta não criada');
  return created.goal.id;
}

async function checkLink(context: LifecycleCheckContext): Promise<void> {
  const { handle, client, assertCondition, reportCheck } = context;
  const owner = await resolvePersistenceOwner(handle, 'subject-goal-run-a');
  const other = await resolvePersistenceOwner(handle, 'subject-goal-run-b');
  const goalId = await newGoalId(context, 'subject-goal-run-a');
  const run = await seedRun(handle, owner, { kind: RUN_KIND.LIVE_PAPER, goalId });
  assertCondition(
    run.goalId === goalId && run.goalOutcome === undefined,
    'a simulação guarda a meta',
  );
  const otherVersion = await seedStrategyVersion(handle, other);
  const foreign = await createRunRepository(handle).createRun(
    other.scope,
    buildRunParams(otherVersion.id, { kind: RUN_KIND.LIVE_PAPER, periodEnd: undefined, goalId }),
  );
  assertCondition(foreign === undefined, 'meta de outro dono recusa a execução');
  const raw = await captureErrorCode(
    client.unsafe(
      `INSERT INTO runs (id, user_id, strategy_version_id, kind, symbol, timeframe, run_parameters, run_hash,
        engine_version, signal_engine_version, metrics_version, period_start, goal_id)
       VALUES ($1, $2, $3, 'live_paper', 'BTCUSDT', '1h', '{}'::jsonb, $4, 'engine-2', 'signal-2', 'metrics-1', 1, $5)`,
      [crypto.randomUUID(), other.userId, otherVersion.id, hashOf('raw'), goalId],
    ),
  );
  assertCondition(
    raw === FOREIGN_KEY_VIOLATION_SQLSTATE,
    `o banco recusa meta de outro dono (${raw})`,
  );
  const backtest = await captureErrorCode(
    seedRun(handle, owner, { kind: RUN_KIND.BACKTEST, goalId }),
  );
  assertCondition(
    backtest === CHECK_VIOLATION_SQLSTATE,
    `meta só em simulação ao vivo (${backtest})`,
  );
  const deleted = await createGoalRepository(handle).deleteGoal(owner.scope, goalId);
  assertCondition(deleted === GOAL_DELETE_OUTCOME.IN_USE, 'meta com simulação não se apaga');
  reportCheck(
    'meta e execução: a FK composta recusa dono divergente; só ao vivo; meta em uso não se apaga',
  );
}

async function checkOutcome(context: LifecycleCheckContext): Promise<void> {
  const { handle, client, assertCondition, reportCheck } = context;
  const owner = await resolvePersistenceOwner(handle, 'subject-goal-outcome');
  const goalId = await newGoalId(context, 'subject-goal-outcome');
  const batches = createRunBatchRepository(handle);
  const runs = createRunRepository(handle);
  const live = await seedRun(handle, owner, { kind: RUN_KIND.LIVE_PAPER, goalId });
  const plain = await seedRun(handle, owner, { kind: RUN_KIND.LIVE_PAPER });
  const record = (runId: string): Promise<boolean | undefined> =>
    batches.runInBatch(owner.scope, runId, (writer) =>
      writer.recordGoalOutcome({ outcome: GOAL_RUN_OUTCOME.REACHED, candleTime: 5 }),
    );
  assertCondition((await record(live.id)) === false, 'execução na fila não grava desfecho');
  for (const id of [live.id, plain.id]) {
    await runs.transitionRun(owner.scope, { runId: id, to: RUN_STATUS.RUNNING });
  }
  assertCondition((await record(plain.id)) === false, 'execução sem meta não grava desfecho');
  assertCondition((await record(live.id)) === true, 'o desfecho é gravado');
  assertCondition((await record(live.id)) === false, 'o desfecho é gravado uma vez só');
  const read = await runs.findRun(owner.scope, live.id);
  assertCondition(
    read?.goalOutcome === GOAL_RUN_OUTCOME.REACHED && read.goalOutcomeCandleTime === 5,
    'desfecho e candle gravados',
  );
  const half = await captureErrorCode(
    client`UPDATE runs SET goal_outcome = 'goal_stopped' WHERE id = ${plain.id}`,
  );
  const unknown = await captureErrorCode(
    client`UPDATE runs SET goal_outcome = 'ganhou', goal_outcome_candle_time = 1 WHERE id = ${live.id}`,
  );
  assertCondition(
    half === CHECK_VIOLATION_SQLSTATE && unknown === CHECK_VIOLATION_SQLSTATE,
    `CHECKs do desfecho: ${half} / ${unknown}`,
  );
  reportCheck(
    'desfecho da meta: só em execução ao vivo rodando e com meta, uma vez, e o banco o confere',
  );
}

async function checkCompletion(context: LifecycleCheckContext): Promise<void> {
  const { handle, assertCondition, reportCheck } = context;
  const owner = await resolvePersistenceOwner(handle, 'subject-goal-complete');
  const goalId = await newGoalId(context, 'subject-goal-complete');
  const run = await seedRun(handle, owner, { kind: RUN_KIND.LIVE_PAPER, goalId });
  const runs = createRunRepository(handle);
  await runs.transitionRun(owner.scope, { runId: run.id, to: RUN_STATUS.RUNNING });
  const complete = (): Promise<boolean | undefined> =>
    createRunBatchRepository(handle).runInBatch(owner.scope, run.id, (writer) =>
      writer.completeRun(),
    );
  assertCondition((await complete()) === true, 'a execução ao vivo conclui');
  assertCondition((await complete()) === false, 'estado final não muda');
  const read = await runs.findRun(owner.scope, run.id);
  assertCondition(
    read?.status === RUN_STATUS.COMPLETED && read.progress === 100 && read.finishedAt !== undefined,
    'concluída, com progresso cheio e fim gravado',
  );
  reportCheck('concluir a simulação da meta: running vira completed uma vez, com fim e progresso');
}

async function checkAlertSide(context: LifecycleCheckContext): Promise<void> {
  const { handle, client, assertCondition, reportCheck } = context;
  const owner = await resolvePersistenceOwner(handle, 'subject-goal-alert');
  await client`UPDATE users SET telegram_chat_id = '740000001' WHERE id = ${owner.userId}`;
  const run = await seedRun(handle, owner, { kind: RUN_KIND.LIVE_PAPER });
  await createRunRepository(handle).transitionRun(owner.scope, {
    runId: run.id,
    to: RUN_STATUS.RUNNING,
  });
  const enqueue = (): Promise<{ readonly written: number } | undefined> =>
    createRunBatchRepository(handle).runInBatch(owner.scope, run.id, (writer) =>
      writer.appendAlerts([{ candleTime: 7, side: ALERT_SIDE.GOAL, payload: { outcome: 'x' } }]),
    );
  const first = await enqueue();
  const again = await enqueue();
  assertCondition(first?.written === 1, 'o alerta de desfecho entra na caixa de saída');
  assertCondition(again?.written === 0, 'o desfecho alerta uma vez só (chave da caixa de saída)');
  const bad = await captureErrorCode(
    client`UPDATE alerts SET side = 'MEIO' WHERE run_id = ${run.id}`,
  );
  assertCondition(bad === CHECK_VIOLATION_SQLSTATE, `lado fora de BUY/SELL/GOAL (${bad})`);
  reportCheck(
    'alerta de desfecho da meta: lado GOAL na caixa de saída, uma vez por execução e candle',
  );
}

export async function checkGoalRuns(context: LifecycleCheckContext): Promise<void> {
  await checkLink(context);
  await checkOutcome(context);
  await checkCompletion(context);
  await checkAlertSide(context);
}
