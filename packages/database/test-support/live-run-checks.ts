// Copyright (c) 2026 Ada Technology. All rights reserved.
import { createLiveRunRepository } from '../src/live-runs/live-run.repository.js';
import { RUN_STATUS } from '../src/runs/run.constant.js';
import type { LifecycleCheckContext } from './account-lifecycle-checks.js';
import {
  createQueueOwner,
  enqueueRuns,
  KIND,
  readRunRow,
  resetQueue,
  setLimits,
  UNBOUNDED_LIMITS,
  type QueueOwner,
} from './run-queue-seed.js';

const WORKER_X = 'worker-x';
const WORKER_Y = 'worker-y';
const TIMEOUT_SECONDS = 60;
const EXPIRED_SECONDS = 600;
const CHECKPOINT_TIME = 1_700_000_000_000;
const CAPPED_LIMIT = 2;
const RACED_RUNS = 12;
const RACE_ROUNDS = 10;
const CAP_RACE_RUNS = 8;
const LOCK_PATIENCE_MILLISECONDS = 1_500;
const CAP_RACE_WORKERS = 6;
const CAP_RACE_TRIALS = 200;

function claimParams(claimedBy: string): {
  readonly claimedBy: string;
  readonly heartbeatTimeoutSeconds: number;
} {
  return { claimedBy, heartbeatTimeoutSeconds: TIMEOUT_SECONDS };
}

async function expire(client: Bun.SQL, runId: string): Promise<void> {
  await client.unsafe(
    `UPDATE runs SET heartbeat_at = now() - make_interval(secs => ${EXPIRED_SECONDS}) WHERE id = $1`,
    [runId],
  );
}

async function checkClaimMarksTheRun(context: LifecycleCheckContext): Promise<void> {
  const { handle, client, assertCondition, reportCheck } = context;
  await resetQueue(client);
  const live = createLiveRunRepository(handle);
  const owner = await createQueueOwner(handle, 'subject-live-claim');
  await setLimits(client, owner, UNBOUNDED_LIMITS);
  const [liveId] = await enqueueRuns(handle, owner, { kind: KIND.LIVE_PAPER, count: 1 });
  const [backtestId] = await enqueueRuns(handle, owner, { kind: KIND.BACKTEST, count: 1 });
  const claimed = await live.claimLiveRuns(claimParams(WORKER_X));
  const row = await readRunRow(client, liveId ?? '');
  assertCondition(claimed.length === 1 && claimed[0]?.runId === liveId, 'reivindica a ao vivo');
  assertCondition(claimed[0]?.isTakeover === false, 'a da fila não é retomada de outro worker');
  assertCondition(row['status'] === RUN_STATUS.RUNNING, 'a reivindicada vira running');
  assertCondition(
    row['claimed_by'] === WORKER_X && row['heartbeat_at'] !== null,
    'dono e batimento',
  );
  assertCondition(row['started_at'] !== null, 'started_at gravado');
  assertCondition(
    (await readRunRow(client, backtestId ?? ''))['status'] === RUN_STATUS.QUEUED,
    'backtest nunca é reivindicado pelo worker ao vivo',
  );
  assertCondition(
    (await live.claimLiveRuns(claimParams(WORKER_Y))).length === 0,
    'a que já tem dono vivo não é reivindicada de novo',
  );
  reportCheck(
    'simulação ao vivo: reivindicada com dono e batimento; backtest e dono vivo ficam de fora',
  );
}

async function checkUserCap(context: LifecycleCheckContext): Promise<void> {
  const { handle, client, assertCondition, reportCheck } = context;
  await resetQueue(client);
  const live = createLiveRunRepository(handle);
  const owner = await createQueueOwner(handle, 'subject-live-cap');
  await setLimits(client, owner, { ...UNBOUNDED_LIMITS, maxActiveLivePaperRuns: CAPPED_LIMIT });
  const ids = await enqueueRuns(handle, owner, { kind: KIND.LIVE_PAPER, count: CAPPED_LIMIT + 1 });
  const claimed = await live.claimLiveRuns(claimParams(WORKER_X));
  assertCondition(
    claimed.length === CAPPED_LIMIT && claimed.every((item, index) => item.runId === ids[index]),
    `o teto do usuário limita a ${CAPPED_LIMIT}, as mais antigas primeiro (${claimed.length})`,
  );
  const third = ids[CAPPED_LIMIT] ?? '';
  assertCondition((await readRunRow(client, third))['status'] === RUN_STATUS.QUEUED, 'a 3ª espera');
  await client.unsafe(
    "UPDATE runs SET status = 'cancelled', finished_at = now(), claimed_by = NULL, heartbeat_at = NULL WHERE id = $1",
    [ids[0] ?? ''],
  );
  const afterRelease = await live.claimLiveRuns(claimParams(WORKER_Y));
  assertCondition(
    afterRelease.length === 1 && afterRelease[0]?.runId === third,
    'a vaga liberada serve a 3ª',
  );
  reportCheck(
    `teto de ${CAPPED_LIMIT} ativas por usuário respeitado e a vaga liberada é reaproveitada`,
  );
}

async function checkTwoWorkersNeverShareARun(context: LifecycleCheckContext): Promise<void> {
  const { handle, client, assertCondition, reportCheck } = context;
  await resetQueue(client);
  const live = createLiveRunRepository(handle);
  const owner = await createQueueOwner(handle, 'subject-live-race');
  await setLimits(client, owner, { ...UNBOUNDED_LIMITS, maxActiveLivePaperRuns: RACED_RUNS });
  const ids = await enqueueRuns(handle, owner, { kind: KIND.LIVE_PAPER, count: RACED_RUNS });
  const first = new Set<string>();
  const second = new Set<string>();
  // Quem perde a trava do usuário pula e tenta de novo na ronda seguinte: algumas rodadas esvaziam a fila.
  for (let round = 0; round < RACE_ROUNDS && first.size + second.size < ids.length; round += 1) {
    const [byX, byY] = await Promise.all([
      live.claimLiveRuns(claimParams(WORKER_X)),
      live.claimLiveRuns(claimParams(WORKER_Y)),
    ]);
    for (const item of byX) first.add(item.runId);
    for (const item of byY) second.add(item.runId);
  }
  const taken = [...first, ...second];
  assertCondition(new Set(taken).size === taken.length, 'nenhuma execução foi para dois workers');
  assertCondition(taken.length === ids.length, `todas foram reivindicadas (${taken.length})`);
  const rows: unknown = await client.unsafe(
    'SELECT id, claimed_by FROM runs WHERE kind = $1 AND status = $2',
    ['live_paper', 'running'],
  );
  const owners = (rows as readonly { id: string; claimed_by: string }[]).every(
    (row) =>
      (row.claimed_by === WORKER_X) === first.has(row.id) &&
      (row.claimed_by === WORKER_Y) === second.has(row.id),
  );
  assertCondition(owners, 'o dono gravado é o worker que recebeu a execução');
  reportCheck(`dois workers disputando ${RACED_RUNS} simulações: cada uma foi para um só`);
}

async function checkTakeoverAndHeartbeat(context: LifecycleCheckContext): Promise<void> {
  const { handle, client, assertCondition, reportCheck } = context;
  await resetQueue(client);
  const live = createLiveRunRepository(handle);
  const owner = await createQueueOwner(handle, 'subject-live-takeover');
  await setLimits(client, owner, { ...UNBOUNDED_LIMITS, maxActiveLivePaperRuns: 1 });
  const [oldest, newest] = await enqueueRuns(handle, owner, { kind: KIND.LIVE_PAPER, count: 2 });
  await live.claimLiveRuns({ ...claimParams(WORKER_X) });
  assertCondition(
    (await live.claimLiveRuns(claimParams(WORKER_Y))).length === 0,
    'batimento vivo: ninguém toma a execução',
  );
  await expire(client, oldest ?? '');
  const taken = await live.claimLiveRuns(claimParams(WORKER_Y));
  assertCondition(
    taken.length === 1 && taken[0]?.runId === oldest && taken[0]?.isTakeover === true,
    'batimento vencido: outro worker assume a execução (isTakeover)',
  );
  assertCondition(
    (await readRunRow(client, newest ?? ''))['status'] === RUN_STATUS.QUEUED,
    'o vencido não conta no teto: a assumida ocupa a única vaga e a outra espera',
  );
  const late = await live.renewHeartbeat({ claimedBy: WORKER_X, runIds: [oldest ?? ''] });
  assertCondition(
    late.held.length === 0 && late.lost[0] === oldest,
    'o worker que perdeu a posse descobre ao renovar o batimento',
  );
  reportCheck('batimento vencido: outro worker assume e o antigo descobre ao renovar');
}

async function raceForTheSingleSlot(
  context: LifecycleCheckContext,
  params: { readonly trial: number; readonly owner: QueueOwner },
): Promise<number> {
  const { handle, client } = context;
  const { trial, owner } = params;
  await resetQueue(client);
  await enqueueRuns(handle, owner, { kind: KIND.LIVE_PAPER, count: CAP_RACE_RUNS });
  const live = createLiveRunRepository(handle);
  await Promise.all(
    Array.from({ length: CAP_RACE_WORKERS }, (_unused, index) =>
      live.claimLiveRuns(claimParams(`worker-race-${trial}-${index}`)),
    ),
  );
  const rows: unknown = await client.unsafe(
    "SELECT count(*)::int AS total FROM runs WHERE kind = 'live_paper' AND status = 'running'",
  );
  return (rows as readonly { total: number }[])[0]?.total ?? 0;
}

async function checkCapHoldsUnderRace(context: LifecycleCheckContext): Promise<void> {
  await resetQueue(context.client);
  const owner = await createQueueOwner(context.handle, 'subject-live-cap-race');
  await setLimits(context.client, owner, { ...UNBOUNDED_LIMITS, maxActiveLivePaperRuns: 1 });
  let worst = 0;
  for (let trial = 0; trial < CAP_RACE_TRIALS; trial += 1) {
    worst = Math.max(worst, await raceForTheSingleSlot(context, { trial, owner }));
  }
  context.assertCondition(
    worst === 1,
    `o teto de 1 vale mesmo com vários workers disputando (no pior caso ${worst} rodando)`,
  );
  context.reportCheck(
    `teto por usuário vale sob disputa: ${CAP_RACE_WORKERS} workers em ${CAP_RACE_TRIALS} rodadas nunca passam dele`,
  );
}

async function checkExpiredDoesNotHoldASlot(context: LifecycleCheckContext): Promise<void> {
  const { handle, client, assertCondition, reportCheck } = context;
  await resetQueue(client);
  const live = createLiveRunRepository(handle);
  const owner = await createQueueOwner(handle, 'subject-live-expired-slot');
  await setLimits(client, owner, { ...UNBOUNDED_LIMITS, maxActiveLivePaperRuns: 1 });
  const [queued, stale] = await enqueueRuns(handle, owner, { kind: KIND.LIVE_PAPER, count: 2 });
  await client.unsafe(
    "UPDATE runs SET status = 'running', claimed_by = $2, heartbeat_at = now() WHERE id = $1",
    [stale ?? '', WORKER_X],
  );
  await expire(client, stale ?? '');
  const claimed = await live.claimLiveRuns(claimParams(WORKER_Y));
  assertCondition(
    claimed.length === 1 && claimed[0]?.runId === queued,
    'a de batimento vencido não ocupa a vaga: a mais antiga da fila é a que entra',
  );
  assertCondition(
    (await readRunRow(client, stale ?? ''))['claimed_by'] === WORKER_X,
    'e a vencida não é assumida enquanto a vaga está ocupada',
  );
  reportCheck('batimento vencido não ocupa vaga do teto; a vaga é de quem está vivo');
}

async function checkLockedRunDoesNotBlock(context: LifecycleCheckContext): Promise<void> {
  const { handle, client, assertCondition, reportCheck } = context;
  await resetQueue(client);
  const live = createLiveRunRepository(handle);
  const locked = await createQueueOwner(handle, 'subject-live-lock-first');
  const free = await createQueueOwner(handle, 'subject-live-lock-second');
  const [lockedRun] = await enqueueRuns(handle, locked, { kind: KIND.LIVE_PAPER, count: 1 });
  const [freeRun] = await enqueueRuns(handle, free, { kind: KIND.LIVE_PAPER, count: 1 });
  const held: { settled?: Promise<readonly { runId: string }[]>; blocked?: boolean } = {};
  await client.begin(async (transaction) => {
    await transaction`SELECT id FROM runs WHERE id = ${lockedRun ?? ''} FOR UPDATE`;
    held.settled = live.claimLiveRuns(claimParams(WORKER_X));
    held.blocked =
      (await Promise.race([held.settled, Bun.sleep(LOCK_PATIENCE_MILLISECONDS)])) === undefined;
  });
  const claimed = await held.settled;
  assertCondition(
    held.blocked !== true,
    'a execução travada por outro worker BLOQUEOU a reivindicação',
  );
  assertCondition(
    claimed?.length === 1 && claimed[0]?.runId === freeRun,
    'com a primeira travada, o worker segue para a próxima',
  );
  reportCheck('execução travada por outro worker é pulada, sem bloquear a reivindicação');
}

async function checkInactiveOwners(context: LifecycleCheckContext): Promise<void> {
  const { handle, client, assertCondition, reportCheck } = context;
  await resetQueue(client);
  const live = createLiveRunRepository(handle);
  const blocked = await createQueueOwner(handle, 'subject-live-blocked');
  const active = await createQueueOwner(handle, 'subject-live-active');
  await setLimits(client, blocked, UNBOUNDED_LIMITS);
  await setLimits(client, active, UNBOUNDED_LIMITS);
  const [running, waiting] = await enqueueRuns(handle, blocked, {
    kind: KIND.LIVE_PAPER,
    count: 2,
  });
  const [other] = await enqueueRuns(handle, active, { kind: KIND.LIVE_PAPER, count: 1 });
  const [backtest] = await enqueueRuns(handle, blocked, { kind: KIND.BACKTEST, count: 1 });
  await client.unsafe(
    "UPDATE runs SET status = 'running', claimed_by = $2, heartbeat_at = now() WHERE id = $1",
    [running ?? '', WORKER_X],
  );
  await client.unsafe(
    "UPDATE runs SET status = 'running', claimed_by = $2, heartbeat_at = now() WHERE id = $1",
    [backtest ?? '', 'api-x'],
  );
  await client.unsafe('UPDATE users SET blocked_at = now() WHERE id = $1', [blocked.userId]);
  const claimed = await live.claimLiveRuns(claimParams(WORKER_Y));
  assertCondition(
    claimed.length === 1 && claimed[0]?.runId === other,
    'conta bloqueada não é reivindicada; a de outro usuário é',
  );
  assertCondition((await live.cancelLiveRunsOfInactiveOwners()) === 1, 'cancela só a que rodava');
  const cancelled = await readRunRow(client, running ?? '');
  assertCondition(
    cancelled['status'] === RUN_STATUS.CANCELLED &&
      cancelled['claimed_by'] === null &&
      cancelled['finished_at'] !== null,
    'a running da conta bloqueada é cancelada e perde a posse',
  );
  assertCondition(
    (await readRunRow(client, waiting ?? ''))['status'] === RUN_STATUS.QUEUED,
    'a queued fica como está (volta se a conta for desbloqueada)',
  );
  assertCondition(
    (await readRunRow(client, backtest ?? ''))['status'] === RUN_STATUS.RUNNING,
    'backtest não é tocado pelo worker ao vivo',
  );
  assertCondition(
    (await readRunRow(client, other ?? ''))['status'] === RUN_STATUS.RUNNING,
    'a de outro usuário segue',
  );
  await client.unsafe('UPDATE users SET blocked_at = NULL, deleted_at = now() WHERE id = $1', [
    blocked.userId,
  ]);
  assertCondition(
    (await live.claimLiveRuns(claimParams(WORKER_Y))).length === 0,
    'conta apagada também não é reivindicada',
  );
  reportCheck('conta bloqueada ou apagada: não é reivindicada e a que rodava é cancelada');
}

async function checkRelease(context: LifecycleCheckContext): Promise<void> {
  const { handle, client, assertCondition, reportCheck } = context;
  await resetQueue(client);
  const live = createLiveRunRepository(handle);
  const owner = await createQueueOwner(handle, 'subject-live-release');
  await setLimits(client, owner, UNBOUNDED_LIMITS);
  const [runId] = await enqueueRuns(handle, owner, { kind: KIND.LIVE_PAPER, count: 1 });
  await live.claimLiveRuns(claimParams(WORKER_X));
  await client.unsafe(
    `UPDATE runs SET engine_state = '{"kind":"checkpoint"}'::jsonb, last_candle_time = ${CHECKPOINT_TIME} WHERE id = $1`,
    [runId ?? ''],
  );
  assertCondition((await live.releaseClaimedRuns({ claimedBy: WORKER_Y })) === 0, 'só as próprias');
  assertCondition(
    (await live.releaseClaimedRuns({ claimedBy: WORKER_X })) === 1,
    'devolve a própria',
  );
  const row = await readRunRow(client, runId ?? '');
  assertCondition(
    row['status'] === RUN_STATUS.QUEUED &&
      row['claimed_by'] === null &&
      row['has_checkpoint'] === true,
    'volta à fila sem posse, com o checkpoint preservado',
  );
  reportCheck('encerramento gracioso: a simulação volta à fila com o checkpoint');
}

export async function checkLiveRuns(context: LifecycleCheckContext): Promise<void> {
  await checkClaimMarksTheRun(context);
  await checkUserCap(context);
  await checkTwoWorkersNeverShareARun(context);
  await checkTakeoverAndHeartbeat(context);
  await checkCapHoldsUnderRace(context);
  await checkExpiredDoesNotHoldASlot(context);
  await checkLockedRunDoesNotBlock(context);
  await checkInactiveOwners(context);
  await checkRelease(context);
}
