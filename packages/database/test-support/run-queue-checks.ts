// Copyright (c) 2026 Ada Technology. All rights reserved.
import { createRunQueueRepository } from '../src/run-queue/run-queue.repository.js';
import type { RunQueueRepository } from '../src/run-queue/run-queue.types.js';
import type { LifecycleCheckContext } from './account-lifecycle-checks.js';
import {
  completeRun,
  createQueueOwner,
  enqueueRuns,
  KIND,
  readRunRow,
  resetQueue,
  setLimits,
  UNBOUNDED_LIMITS,
  type QueueOwner,
} from './run-queue-seed.js';

const CONCURRENT_WORKERS = 8;
const CONCURRENT_RUNS_PER_OWNER = 10;
const CONCURRENT_OWNERS = 4;
const FAIRNESS_BACKLOG = 10;
const LOCK_PATIENCE_MILLISECONDS = 3_000;
const MAXIMUM_EMPTY_ROUNDS = 40;
const CAP_RACE_CLAIMERS = 16;
const CAP_RACE_RUNS = 6;
const CAP_RACE_ROUNDS = 6;
const INSTANCE_X = 'instance-x';
const INSTANCE_Y = 'instance-y';

async function claimId(queue: RunQueueRepository, claimedBy: string): Promise<string | undefined> {
  return (await queue.claimNextRun({ claimedBy }))?.runId;
}

async function checkCapsPerKindAndOwner(context: LifecycleCheckContext): Promise<void> {
  const { handle, client, assertCondition, reportCheck } = context;
  await resetQueue(client);
  const queue = createRunQueueRepository(handle);
  const owner = await createQueueOwner(handle, 'subject-queue-caps-a');
  const other = await createQueueOwner(handle, 'subject-queue-caps-b');
  const backtests = await enqueueRuns(handle, owner, { kind: KIND.BACKTEST, count: 3 });
  const walkForwards = await enqueueRuns(handle, owner, { kind: KIND.WALK_FORWARD, count: 2 });
  const otherWalkForward = await enqueueRuns(handle, other, { kind: KIND.WALK_FORWARD, count: 1 });
  const claimed: (string | undefined)[] = [];
  for (let index = 0; index < 6; index += 1) claimed.push(await claimId(queue, INSTANCE_X));
  const [firstBacktest, secondBacktest, thirdBacktest] = backtests;
  const [firstWalkForward, secondWalkForward] = walkForwards;
  assertCondition(
    claimed.includes(firstBacktest) && claimed.includes(secondBacktest),
    'dois backtests do mesmo usuário rodam juntos (teto padrão 2)',
  );
  assertCondition(!claimed.includes(thirdBacktest), 'o 3º backtest do mesmo usuário ESPERA');
  assertCondition(claimed.includes(firstWalkForward), 'o 1º walk-forward roda');
  assertCondition(
    !claimed.includes(secondWalkForward),
    'o 2º walk-forward do mesmo usuário ESPERA',
  );
  assertCondition(
    claimed.includes(otherWalkForward[0]),
    'o walk-forward de OUTRO usuário roda na hora, com o do primeiro ainda rodando',
  );
  assertCondition(claimed.filter((id) => id !== undefined).length === 4, 'só quatro elegíveis');
  await completeRun(handle, owner, firstBacktest ?? '');
  assertCondition((await claimId(queue, INSTANCE_X)) === thirdBacktest, 'vaga de backtest libera');
  await completeRun(handle, owner, firstWalkForward ?? '');
  assertCondition((await claimId(queue, INSTANCE_X)) === secondWalkForward, 'vaga de WF libera');
  reportCheck(
    'tetos por usuário e tipo: backtest 2, walk-forward 1; o de outro usuário não espera',
  );
}

async function checkLimitsComeFromTheUser(context: LifecycleCheckContext): Promise<void> {
  const { handle, client, assertCondition, reportCheck } = context;
  await resetQueue(client);
  const queue = createRunQueueRepository(handle);
  const wide = await createQueueOwner(handle, 'subject-queue-limits-wide');
  const broken = await createQueueOwner(handle, 'subject-queue-limits-broken');
  await setLimits(client, wide, { maxConcurrentWalkForwards: 3, maxConcurrentBacktests: 1 });
  await setLimits(client, broken, {
    maxConcurrentWalkForwards: 'muitos',
    maxConcurrentBacktests: -4,
  });
  await enqueueRuns(handle, wide, { kind: KIND.WALK_FORWARD, count: 4 });
  await enqueueRuns(handle, wide, { kind: KIND.BACKTEST, count: 2 });
  await enqueueRuns(handle, broken, { kind: KIND.WALK_FORWARD, count: 2 });
  await enqueueRuns(handle, broken, { kind: KIND.BACKTEST, count: 3 });
  let total = 0;
  for (let index = 0; index < 12; index += 1) total += (await claimId(queue, INSTANCE_X)) ? 1 : 0;
  const rows: unknown =
    await client`SELECT u.keycloak_sub AS subject, r.kind, count(*)::int AS total FROM runs r JOIN users u ON u.id = r.user_id WHERE r.status = 'running' GROUP BY u.keycloak_sub, r.kind`;
  const running = new Map(
    (rows as readonly { subject: string; kind: string; total: number }[]).map((row) => [
      `${row.subject}/${row.kind}`,
      row.total,
    ]),
  );
  assertCondition(
    running.get('subject-queue-limits-wide/walk_forward') === 3,
    'teto do usuário: 3 WF',
  );
  assertCondition(
    running.get('subject-queue-limits-wide/backtest') === 1,
    'teto do usuário: 1 backtest',
  );
  assertCondition(running.get('subject-queue-limits-broken/walk_forward') === 1, 'inválido -> 1');
  assertCondition(running.get('subject-queue-limits-broken/backtest') === 2, 'inválido -> 2');
  assertCondition(total === 7, `execuções reivindicadas: ${total}`);
  reportCheck('tetos lidos de users.limits; valor inválido ou ausente cai no padrão seguro');
}

async function claimSequence(
  context: LifecycleCheckContext,
  owners: ReadonlyMap<string, QueueOwner>,
  count: number,
): Promise<readonly string[]> {
  const { handle, client } = context;
  const queue = createRunQueueRepository(handle);
  const sequence: string[] = [];
  for (let index = 0; index < count; index += 1) {
    const runId = await claimId(queue, INSTANCE_X);
    if (runId === undefined) break;
    const rows: unknown =
      await client`SELECT u.keycloak_sub AS subject FROM runs r JOIN users u ON u.id = r.user_id WHERE r.id = ${runId}`;
    const subject = (rows as readonly { subject: string }[])[0]?.subject ?? '?';
    sequence.push(subject);
    const owner = owners.get(subject);
    if (owner !== undefined) await completeRun(handle, owner, runId);
  }
  return sequence;
}

async function checkRoundRobinFairness(context: LifecycleCheckContext): Promise<void> {
  const { handle, client, assertCondition, reportCheck } = context;
  await resetQueue(client);
  const heavy = await createQueueOwner(handle, 'subject-queue-fair-heavy');
  const light = await createQueueOwner(handle, 'subject-queue-fair-light');
  await enqueueRuns(handle, heavy, { kind: KIND.BACKTEST, count: FAIRNESS_BACKLOG });
  await enqueueRuns(handle, light, { kind: KIND.BACKTEST, count: 1 });
  const owners = new Map([
    ['subject-queue-fair-heavy', heavy],
    ['subject-queue-fair-light', light],
  ]);
  const sequence = await claimSequence(context, owners, FAIRNESS_BACKLOG + 1);
  const lightPosition = sequence.indexOf('subject-queue-fair-light');
  assertCondition(
    lightPosition >= 0 && lightPosition < 2,
    `NÃO-INANIÇÃO: quem enfileirou depois começa antes da 3ª do outro: posição ${lightPosition + 1}`,
  );
  await resetQueue(client);
  const [first, second, third] = await Promise.all(
    ['a', 'b', 'c'].map((letter) => createQueueOwner(handle, `subject-queue-rr-${letter}`)),
  );
  if (first === undefined || second === undefined || third === undefined) throw new Error('donos');
  for (const owner of [first, second, third]) {
    await enqueueRuns(handle, owner, { kind: KIND.BACKTEST, count: 4 });
  }
  const ring = new Map(
    [first, second, third].map((owner, index) => [`subject-queue-rr-${'abc'[index]}`, owner]),
  );
  const rotation = await claimSequence(context, ring, 9);
  const roundsAreComplete = [0, 3, 6].every(
    (start) => new Set(rotation.slice(start, start + 3)).size === 3,
  );
  assertCondition(roundsAreComplete, `rodízio entre usuários: ${rotation.join(' ')}`);
  reportCheck('justiça: round-robin entre usuários; o que enfileirou depois não fica para trás');
}

async function drainWithWorkers(
  queue: RunQueueRepository,
  claimedBy: string,
  claimed: string[],
  maximumEmptyRounds = MAXIMUM_EMPTY_ROUNDS,
): Promise<void> {
  let emptyRounds = 0;
  while (emptyRounds < maximumEmptyRounds) {
    const runId = await claimId(queue, claimedBy);
    if (runId === undefined) {
      emptyRounds += 1;
      await Bun.sleep(5);
      continue;
    }
    emptyRounds = 0;
    claimed.push(runId);
  }
}

async function checkClaimIsExclusive(context: LifecycleCheckContext): Promise<void> {
  const { handle, client, assertCondition, reportCheck } = context;
  await resetQueue(client);
  const queue = createRunQueueRepository(handle);
  const expected: string[] = [];
  for (let index = 0; index < CONCURRENT_OWNERS; index += 1) {
    const owner = await createQueueOwner(handle, `subject-queue-race-${index}`);
    await setLimits(client, owner, UNBOUNDED_LIMITS);
    expected.push(
      ...(await enqueueRuns(handle, owner, {
        kind: KIND.BACKTEST,
        count: CONCURRENT_RUNS_PER_OWNER,
      })),
    );
  }
  const claimedByX: string[] = [];
  const claimedByY: string[] = [];
  await Promise.all([
    ...Array.from({ length: CONCURRENT_WORKERS }, () =>
      drainWithWorkers(queue, INSTANCE_X, claimedByX),
    ),
    ...Array.from({ length: CONCURRENT_WORKERS }, () =>
      drainWithWorkers(queue, INSTANCE_Y, claimedByY),
    ),
  ]);
  const everything = [...claimedByX, ...claimedByY];
  assertCondition(
    new Set(everything).size === everything.length,
    `uma execução foi reivindicada duas vezes (${everything.length} reivindicações)`,
  );
  assertCondition(
    new Set(everything).size === expected.length && expected.every((id) => everything.includes(id)),
    `nenhuma se perde: ${new Set(everything).size} de ${expected.length}`,
  );
  const rows: unknown =
    await client`SELECT count(*)::int AS total FROM runs WHERE status = 'running' AND claimed_by IN (${INSTANCE_X}, ${INSTANCE_Y})`;
  assertCondition(
    (rows as readonly { total: number }[])[0]?.total === expected.length,
    'todas running',
  );
  assertCondition(claimedByX.length > 0 && claimedByY.length > 0, 'as duas instâncias participam');
  reportCheck(
    `${CONCURRENT_WORKERS * 2} reivindicadores simultâneos em 2 instâncias: ${expected.length} execuções, cada uma reivindicada uma vez e nenhuma perdida`,
  );
}

type PatientClaim = {
  // O que a reivindicação devolveu dentro do prazo; `blocked` se ainda esperava uma trava.
  readonly outcome: string | undefined;
  // Termina só depois de a trava cair: quem a segura precisa encerrá-la antes de esperar por isto.
  readonly settled: Promise<string | undefined>;
};

async function claimWithinPatience(queue: RunQueueRepository): Promise<PatientClaim> {
  const settled = claimId(queue, INSTANCE_X);
  const outcome = await Promise.race([
    settled,
    Bun.sleep(LOCK_PATIENCE_MILLISECONDS).then(() => 'blocked' as const),
  ]);
  return { outcome, settled };
}

async function checkSkipLocked(context: LifecycleCheckContext): Promise<void> {
  const { handle, client, assertCondition, reportCheck } = context;
  await resetQueue(client);
  const queue = createRunQueueRepository(handle);
  const locked = await createQueueOwner(handle, 'subject-queue-lock-first');
  const free = await createQueueOwner(handle, 'subject-queue-lock-second');
  const [lockedRun] = await enqueueRuns(handle, locked, { kind: KIND.BACKTEST, count: 1 });
  const [freeRun] = await enqueueRuns(handle, free, { kind: KIND.BACKTEST, count: 1 });
  const held: { attempt?: PatientClaim } = {};
  await client.begin(async (transaction) => {
    await transaction`SELECT id FROM runs WHERE id = ${lockedRun ?? ''} FOR UPDATE`;
    held.attempt = await claimWithinPatience(queue);
  });
  await held.attempt?.settled;
  const outcome = held.attempt?.outcome;
  assertCondition(
    outcome !== 'blocked',
    'a execução travada por outro reivindicador BLOQUEOU a fila',
  );
  assertCondition(outcome === freeRun, 'com a primeira travada, a fila segue para a próxima');
  const [nextFree] = await enqueueRuns(handle, free, { kind: KIND.BACKTEST, count: 1 });
  const heldUser: { attempt?: PatientClaim } = {};
  await client.begin(async (transaction) => {
    await transaction`SELECT id FROM users WHERE id = ${locked.userId} FOR NO KEY UPDATE`;
    heldUser.attempt = await claimWithinPatience(queue);
  });
  await heldUser.attempt?.settled;
  assertCondition(
    heldUser.attempt?.outcome !== 'blocked',
    'o usuário travado por outro reivindicador BLOQUEOU a fila',
  );
  assertCondition(
    heldUser.attempt?.outcome === nextFree,
    'usuário travado é pulado e o próximo segue',
  );
  reportCheck('FOR UPDATE SKIP LOCKED: execução ou usuário travado nunca bloqueia o reivindicador');
}

async function checkCapHoldsUnderConcurrency(context: LifecycleCheckContext): Promise<void> {
  const { handle, client, assertCondition, reportCheck } = context;
  await resetQueue(client);
  const queue = createRunQueueRepository(handle);
  const owner = await createQueueOwner(handle, 'subject-queue-cap-race');
  await setLimits(client, owner, { ...UNBOUNDED_LIMITS, maxConcurrentWalkForwards: 1 });
  await enqueueRuns(handle, owner, { kind: KIND.WALK_FORWARD, count: CAP_RACE_RUNS });
  const claimed: string[] = [];
  await Promise.all(
    Array.from({ length: CAP_RACE_CLAIMERS }, () =>
      drainWithWorkers(queue, INSTANCE_X, claimed, CAP_RACE_ROUNDS),
    ),
  );
  const rows: unknown =
    await client`SELECT count(*)::int AS total FROM runs WHERE status = 'running' AND user_id = ${owner.userId}`;
  const running = (rows as readonly { total: number }[])[0]?.total;
  assertCondition(
    running === 1,
    `teto de 1 walk-forward sob concorrência: ${String(running)} rodando`,
  );
  assertCondition(claimed.length === 1, `reivindicações: ${claimed.length}`);
  reportCheck(
    `${CAP_RACE_CLAIMERS} reivindicadores simultâneos disputam ${CAP_RACE_RUNS} walk-forwards do mesmo usuário: o teto de 1 se mantém`,
  );
}

export async function checkRunQueueClaims(context: LifecycleCheckContext): Promise<void> {
  await checkCapsPerKindAndOwner(context);
  await checkLimitsComeFromTheUser(context);
  await checkRoundRobinFairness(context);
  await checkSkipLocked(context);
  await checkClaimIsExclusive(context);
  await checkCapHoldsUnderConcurrency(context);
}

export { readRunRow };
