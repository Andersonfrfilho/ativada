// Copyright (c) 2026 Ada Technology. All rights reserved.
import { RUN_ORPHAN_POLICY } from '../src/run-queue/run-queue.constant.js';
import { createRunQueueRepository } from '../src/run-queue/run-queue.repository.js';
import { RUN_STATUS } from '../src/runs/run.constant.js';
import { createRunRepository } from '../src/runs/run.repository.js';
import type { LifecycleCheckContext } from './account-lifecycle-checks.js';
import { captureErrorCode } from './persistence-seed.js';
import {
  createQueueOwner,
  enqueueRuns,
  KIND,
  readRunRow,
  resetQueue,
  setLimits,
  UNBOUNDED_LIMITS,
} from './run-queue-seed.js';

const CHECK_VIOLATION = '23514';
const INSTANCE_X = 'instance-x';
const INSTANCE_Y = 'instance-y';
const TIMEOUT_SECONDS = 60;
const EXPIRED_SECONDS = 600;
const STALE_SECONDS = 30;
const FRESH_SECONDS = 5;

async function expire(client: Bun.SQL, runId: string): Promise<void> {
  await client.unsafe(
    `UPDATE runs SET heartbeat_at = now() - make_interval(secs => ${EXPIRED_SECONDS}) WHERE id = $1`,
    [runId],
  );
}

async function giveCheckpoint(client: Bun.SQL, runId: string): Promise<void> {
  await client.unsafe(
    `UPDATE runs SET engine_state = '{"kind":"checkpoint"}'::jsonb, last_candle_time = 1700000000000, progress = 40 WHERE id = $1`,
    [runId],
  );
}

async function claimAll(
  context: LifecycleCheckContext,
  count: number,
  instance: string,
): Promise<void> {
  const queue = createRunQueueRepository(context.handle);
  for (let index = 0; index < count; index += 1) await queue.claimNextRun({ claimedBy: instance });
}

async function checkClaimMarksTheRun(context: LifecycleCheckContext): Promise<void> {
  const { handle, client, assertCondition, reportCheck } = context;
  await resetQueue(client);
  const queue = createRunQueueRepository(handle);
  const owner = await createQueueOwner(handle, 'subject-queue-claim');
  const [runId, livePaper] = [
    ...(await enqueueRuns(handle, owner, { kind: KIND.BACKTEST, count: 1 })),
    ...(await enqueueRuns(handle, owner, { kind: KIND.LIVE_PAPER, count: 1 })),
  ];
  const claimed = await queue.claimNextRun({ claimedBy: INSTANCE_X });
  const row = await readRunRow(client, runId ?? '');
  assertCondition(claimed?.runId === runId && claimed?.kind === KIND.BACKTEST, 'devolve id e tipo');
  assertCondition(row['status'] === RUN_STATUS.RUNNING, 'a reivindicada vira running');
  assertCondition(
    row['claimed_by'] === INSTANCE_X && row['heartbeat_at'] !== null,
    'dono e batimento',
  );
  assertCondition(row['started_at'] !== null, 'started_at gravado');
  assertCondition((await queue.claimNextRun({ claimedBy: INSTANCE_X })) === undefined, 'só uma');
  assertCondition(
    (await readRunRow(client, livePaper ?? ''))['status'] === RUN_STATUS.QUEUED,
    'live_paper nunca é reivindicada pela fila',
  );
  const code = await captureErrorCode(
    client`UPDATE runs SET claimed_by = 'fantasma' WHERE id = ${livePaper ?? ''}`,
  );
  assertCondition(code === CHECK_VIOLATION, `claimed_by só em running (CHECK): ${code}`);
  const runs = createRunRepository(handle);
  await runs.transitionRun(owner.scope, { runId: runId ?? '', to: RUN_STATUS.COMPLETED });
  const done = await readRunRow(client, runId ?? '');
  assertCondition(
    done?.['claimed_by'] === null && done['heartbeat_at'] === null,
    'final limpa a posse',
  );
  reportCheck(
    'a reivindicada vira running com dono e batimento; ao vivo fica de fora; final limpa a posse',
  );
}

async function checkHeartbeatAndOrphans(context: LifecycleCheckContext): Promise<void> {
  const { handle, client, assertCondition, reportCheck } = context;
  await resetQueue(client);
  const queue = createRunQueueRepository(handle);
  const owner = await createQueueOwner(handle, 'subject-queue-orphans');
  await setLimits(client, owner, UNBOUNDED_LIMITS);
  const ids = await enqueueRuns(handle, owner, { kind: KIND.BACKTEST, count: 4 });
  const [alive, withCheckpoint, withoutCheckpoint, foreign] = ids;
  await claimAll(context, 3, INSTANCE_X);
  await claimAll(context, 1, INSTANCE_Y);
  await client.unsafe(
    `UPDATE runs SET heartbeat_at = now() - make_interval(secs => ${STALE_SECONDS}) WHERE id = $1`,
    [alive ?? ''],
  );
  const renewed = await queue.renewHeartbeat({ claimedBy: INSTANCE_X, runIds: ids });
  const fresh: unknown = await client.unsafe(
    `SELECT heartbeat_at > now() - make_interval(secs => ${FRESH_SECONDS}) AS is_fresh FROM runs WHERE id = $1`,
    [alive ?? ''],
  );
  assertCondition(
    (fresh as readonly { is_fresh: boolean }[])[0]?.is_fresh === true,
    'renovar de fato move o batimento para agora',
  );
  assertCondition(
    renewed.held.length === 3 && !renewed.held.includes(foreign ?? ''),
    'renova só as execuções do próprio reivindicador, e devolve quais continuam suas',
  );
  assertCondition(
    renewed.lost.length === 1 && renewed.lost[0] === foreign,
    'a que roda sob outra instância viva conta como perdida',
  );
  const live = await enqueueRuns(handle, owner, { kind: KIND.LIVE_PAPER, count: 1 });
  await createRunRepository(handle).transitionRun(owner.scope, {
    runId: live[0] ?? '',
    to: RUN_STATUS.RUNNING,
  });
  await expire(client, live[0] ?? '');
  await giveCheckpoint(client, withCheckpoint ?? '');
  await expire(client, withCheckpoint ?? '');
  await expire(client, withoutCheckpoint ?? '');
  const result = await queue.reclaimExpiredRuns({
    heartbeatTimeoutSeconds: TIMEOUT_SECONDS,
    orphanPolicy: RUN_ORPHAN_POLICY.RESUME_WITH_CHECKPOINT,
  });
  assertCondition(
    result.requeued === 1 && result.failed === 1,
    `reclaim: ${JSON.stringify(result)}`,
  );
  const resumed = await readRunRow(client, withCheckpoint ?? '');
  assertCondition(
    resumed['status'] === RUN_STATUS.QUEUED &&
      resumed['claimed_by'] === null &&
      resumed['has_checkpoint'] === true,
    'órfã COM checkpoint volta para a fila, checkpoint preservado',
  );
  const lost = await readRunRow(client, withoutCheckpoint ?? '');
  assertCondition(
    lost['status'] === RUN_STATUS.FAILED &&
      lost['error_code'] === 'ORPHANED' &&
      lost['finished_at'] !== null,
    'órfã SEM checkpoint vira failed/ORPHANED',
  );
  assertCondition(
    (await readRunRow(client, alive ?? ''))['status'] === RUN_STATUS.RUNNING,
    'viva intocada',
  );
  assertCondition(
    (await readRunRow(client, foreign ?? ''))['status'] === RUN_STATUS.RUNNING,
    'de outra instância, viva, intocada',
  );
  assertCondition(
    (await readRunRow(client, live[0] ?? ''))['status'] === RUN_STATUS.RUNNING,
    'ao vivo nunca é tocada',
  );
  const late = await queue.renewHeartbeat({
    claimedBy: INSTANCE_X,
    runIds: [withCheckpoint ?? ''],
  });
  assertCondition(
    late.held.length === 0 && late.lost[0] === withCheckpoint,
    'quem perdeu a posse descobre ao renovar',
  );
  const finished = await queue.renewHeartbeat({
    claimedBy: INSTANCE_X,
    runIds: [withoutCheckpoint ?? ''],
  });
  assertCondition(
    finished.held.length === 0 && finished.lost.length === 0,
    'a que terminou (failed) não é posse perdida: só não há o que renovar',
  );
  const again = await queue.claimNextRun({ claimedBy: INSTANCE_Y });
  assertCondition(
    again?.runId === withCheckpoint,
    'a requeued é reivindicada de novo, com o checkpoint',
  );
  reportCheck(
    'batimento vencido: com checkpoint volta à fila, sem checkpoint vira failed/ORPHANED; ao vivo e vivas ficam',
  );
}

async function checkFailAllPolicy(context: LifecycleCheckContext): Promise<void> {
  const { handle, client, assertCondition, reportCheck } = context;
  await resetQueue(client);
  const queue = createRunQueueRepository(handle);
  const owner = await createQueueOwner(handle, 'subject-queue-fail-all');
  const [withCheckpoint, legacy] = await enqueueRuns(handle, owner, {
    kind: KIND.WALK_FORWARD,
    count: 2,
  });
  await setLimits(client, owner, UNBOUNDED_LIMITS);
  await claimAll(context, 2, INSTANCE_X);
  await giveCheckpoint(client, withCheckpoint ?? '');
  await expire(client, withCheckpoint ?? '');
  await client.unsafe('UPDATE runs SET heartbeat_at = NULL WHERE id = $1', [legacy ?? '']);
  const result = await queue.reclaimExpiredRuns({
    heartbeatTimeoutSeconds: TIMEOUT_SECONDS,
    orphanPolicy: RUN_ORPHAN_POLICY.FAIL_ALL,
  });
  assertCondition(
    result.requeued === 0 && result.failed === 2,
    `fail_all: ${JSON.stringify(result)}`,
  );
  assertCondition(
    (await readRunRow(client, legacy ?? ''))?.['error_code'] === 'ORPHANED',
    'sem batimento algum vale como vencido',
  );
  reportCheck(
    'política fail: toda órfã vira failed/ORPHANED, inclusive a com checkpoint e a sem batimento',
  );
}

async function checkReleaseOnShutdown(context: LifecycleCheckContext): Promise<void> {
  const { handle, client, assertCondition, reportCheck } = context;
  await resetQueue(client);
  const queue = createRunQueueRepository(handle);
  const owner = await createQueueOwner(handle, 'subject-queue-release');
  await setLimits(client, owner, UNBOUNDED_LIMITS);
  const ids = await enqueueRuns(handle, owner, { kind: KIND.BACKTEST, count: 3 });
  await claimAll(context, 2, INSTANCE_X);
  await claimAll(context, 1, INSTANCE_Y);
  await giveCheckpoint(client, ids[0] ?? '');
  const released = await queue.releaseClaimedRuns({ claimedBy: INSTANCE_X });
  assertCondition(released === 2, `liberadas: ${released}`);
  const back = await readRunRow(client, ids[0] ?? '');
  assertCondition(
    back['status'] === RUN_STATUS.QUEUED &&
      back['claimed_by'] === null &&
      back['has_checkpoint'] === true &&
      back['progress'] === 40,
    'volta para a fila com checkpoint e progresso',
  );
  assertCondition(
    (await readRunRow(client, ids[2] ?? ''))['status'] === RUN_STATUS.RUNNING,
    'a de outra instância fica',
  );
  reportCheck(
    'encerramento gracioso: as running da instância voltam a queued com o checkpoint preservado',
  );
}

async function checkInactiveOwners(context: LifecycleCheckContext): Promise<void> {
  const { handle, client, assertCondition, reportCheck } = context;
  await resetQueue(client);
  const queue = createRunQueueRepository(handle);
  const blocked = await createQueueOwner(handle, 'subject-queue-blocked');
  const deleted = await createQueueOwner(handle, 'subject-queue-deleted');
  const healthy = await createQueueOwner(handle, 'subject-queue-healthy');
  const [blockedRunning] = await enqueueRuns(handle, blocked, { kind: KIND.BACKTEST, count: 1 });
  await claimAll(context, 1, INSTANCE_X);
  const [blockedQueued] = await enqueueRuns(handle, blocked, { kind: KIND.BACKTEST, count: 1 });
  const [deletedQueued] = await enqueueRuns(handle, deleted, { kind: KIND.BACKTEST, count: 1 });
  const [healthyRun] = await enqueueRuns(handle, healthy, { kind: KIND.BACKTEST, count: 1 });
  await client`UPDATE users SET blocked_at = now() WHERE id = ${blocked.userId}`;
  await client`UPDATE users SET deleted_at = now() WHERE id = ${deleted.userId}`;
  const claimed = await queue.claimNextRun({ claimedBy: INSTANCE_Y });
  assertCondition(claimed?.runId === healthyRun, 'só a conta ativa é reivindicada');
  assertCondition(
    (await queue.claimNextRun({ claimedBy: INSTANCE_Y })) === undefined,
    'bloqueada e apagada não',
  );
  const cancelled = await queue.cancelRunsOfInactiveOwners();
  assertCondition(cancelled === 1, `canceladas: ${cancelled}`);
  const row = await readRunRow(client, blockedRunning ?? '');
  assertCondition(
    row['status'] === RUN_STATUS.CANCELLED &&
      row['finished_at'] !== null &&
      row['claimed_by'] === null,
    'a running da bloqueada é cancelada',
  );
  assertCondition(
    (await readRunRow(client, blockedQueued ?? ''))['status'] === RUN_STATUS.QUEUED,
    'a queued fica (volta se desbloquear)',
  );
  assertCondition(
    (await readRunRow(client, deletedQueued ?? ''))['status'] === RUN_STATUS.QUEUED,
    'a da apagada fica para a purga',
  );
  assertCondition(
    (await readRunRow(client, healthyRun ?? ''))['status'] === RUN_STATUS.RUNNING,
    'a ativa segue',
  );
  await client`UPDATE users SET blocked_at = NULL WHERE id = ${blocked.userId}`;
  assertCondition(
    (await queue.claimNextRun({ claimedBy: INSTANCE_Y }))?.runId === blockedQueued,
    'desbloqueada volta',
  );
  reportCheck('conta bloqueada ou apagada: não reivindicada; as running dela são canceladas');
}

export async function checkRunQueueLifecycle(context: LifecycleCheckContext): Promise<void> {
  await checkClaimMarksTheRun(context);
  await checkHeartbeatAndOrphans(context);
  await checkFailAllPolicy(context);
  await checkReleaseOnShutdown(context);
  await checkInactiveOwners(context);
}
