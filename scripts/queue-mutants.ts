// Copyright (c) 2026 Ada Technology. All rights reserved.
import { runDatabaseMutantSuite, type DatabaseMutant } from './mutants/run-database-mutants.js';

const POLICY = 'src/run-queue/claim-policy.ts';
const CLAIM = 'src/run-queue/run-claim.ts';
const RECOVERY = 'src/run-queue/run-recovery.ts';
const READING = 'src/run-queue/run-queue-reading.ts';
const TRANSITION = 'src/runs/run-transition.ts';
const LIVE_CLAIM = 'src/live-runs/live-run-claim.ts';
const LIVE_REPOSITORY = 'src/live-runs/live-run.repository.ts';
const USER_LOCK = ".for('no key update', { skipLocked: true });";
const BLOCKED_FILTER = '        isNull(users.deletedAt),\n        isNull(users.blockedAt),\n';

function edit(file: string, find: string, replace: string): DatabaseMutant['edits'] {
  return [{ file, find, replace }];
}

// Cada mutante quebra UMA regra da fila de execuções; o juiz roda os checks no Postgres real (`run-queue-test`).
const MUTANTS: readonly DatabaseMutant[] = [
  {
    name: 'USER_CAP_IGNORED',
    edits: [
      ...edit(
        POLICY,
        'candidate.runningOfKind < candidate.limits.maxConcurrentBacktests;',
        'true;',
      ),
      ...edit(
        POLICY,
        'candidate.runningOfKind < candidate.limits.maxConcurrentWalkForwards;',
        'true;',
      ),
    ],
  },
  {
    name: 'FIFO_WITHOUT_ROUND_ROBIN',
    edits: edit(POLICY, 'if (firstServed !== secondServed) {', 'if (false as boolean) {'),
  },
  {
    name: 'CLAIM_WITHOUT_SKIP_LOCKED_ON_THE_RUN',
    edits: edit(CLAIM, ".for('update', { skipLocked: true });", ".for('update');"),
  },
  {
    name: 'CLAIM_WITHOUT_SKIP_LOCKED_ON_THE_USER',
    edits: edit(CLAIM, USER_LOCK, ".for('no key update');"),
  },
  {
    name: 'CLAIM_WITHOUT_THE_USER_LOCK',
    edits: edit(
      CLAIM,
      `isNull(users.blockedAt)))\n      ${USER_LOCK}`,
      'isNull(users.blockedAt)));',
    ),
  },
  {
    name: 'HEARTBEAT_NOT_RENEWED',
    edits: edit(
      RECOVERY,
      '.set({ heartbeatAt: sql`now()` })',
      '.set({ claimedBy: params.claimedBy })',
    ),
  },
  {
    name: 'ORPHAN_NEVER_DETECTED',
    edits: edit(
      RECOVERY,
      "lt(runs.heartbeatAt, sql`now() - (${timeoutSeconds}::int * interval '1 second')`),",
      'sql`false`,',
    ),
  },
  {
    name: 'ORPHAN_LOSES_THE_CHECKPOINT',
    edits: edit(
      RECOVERY,
      '      .set({ status: RUN_STATUS.QUEUED, ...NO_CLAIM })\n      .where(expiredClaimable(',
      '      .set({ status: RUN_STATUS.QUEUED, engineState: null, ...NO_CLAIM })\n      .where(expiredClaimable(',
    ),
  },
  {
    name: 'QUEUED_RUN_LOST_ON_SHUTDOWN',
    edits: edit(
      RECOVERY,
      '    .set({ status: RUN_STATUS.QUEUED, ...NO_CLAIM })\n    .where(and(eq(runs.status, RUN_STATUS.RUNNING), eq(runs.claimedBy',
      '    .set({ status: RUN_STATUS.CANCELLED, finishedAt: sql`now()`, ...NO_CLAIM })\n    .where(and(eq(runs.status, RUN_STATUS.RUNNING), eq(runs.claimedBy',
    ),
  },
  {
    name: 'BLOCKED_ACCOUNT_IS_CLAIMED',
    edits: [
      ...edit(CLAIM, BLOCKED_FILTER, ''),
      ...edit(
        CLAIM,
        'eq(users.id, candidate.userId), isNull(users.deletedAt), isNull(users.blockedAt)',
        'eq(users.id, candidate.userId)',
      ),
    ],
  },
  {
    name: 'POSITION_LEAKS_OTHER_USERS',
    edits: edit(
      READING,
      'and(ownerCondition(scope, runs.userId), queued, isAhead)',
      'and(queued, isAhead)',
    ),
  },
  {
    name: 'POSITION_OF_A_FOREIGN_RUN_IS_READABLE',
    edits: edit(
      READING,
      '.where(and(ownerCondition(scope, runs.userId), eq(runs.id, runId), queued))',
      '.where(and(eq(runs.id, runId), queued))',
    ),
  },
  {
    name: 'QUEUE_COUNT_IGNORES_THE_OWNER',
    edits: edit(
      READING,
      '      ownerCondition(scope, runs.userId),\n      eq(runs.status, RUN_STATUS.QUEUED),\n      inArray',
      '      eq(runs.status, RUN_STATUS.QUEUED),\n      inArray',
    ),
  },
  {
    name: 'FINAL_STATE_KEEPS_THE_CLAIM',
    edits: edit(
      TRANSITION,
      '? { finishedAt: sql`now()`, claimedBy: null, heartbeatAt: null }',
      '? { finishedAt: sql`now()` }',
    ),
  },
  {
    name: 'LIVE_USER_CAP_IGNORED',
    edits: edit(
      LIVE_CLAIM,
      'if ((held[0]?.total ?? 0) >= maxActiveLivePaperRuns) return undefined;',
      'void maxActiveLivePaperRuns;',
    ),
  },
  {
    name: 'LIVE_CLAIM_WITHOUT_SKIP_LOCKED_ON_THE_RUN',
    edits: edit(LIVE_CLAIM, ".for('update', { skipLocked: true });", ".for('update');"),
  },
  {
    name: 'LIVE_CLAIM_WITHOUT_THE_USER_LOCK',
    edits: edit(LIVE_CLAIM, ".for('no key update', { skipLocked: true });", ';'),
  },
  {
    name: 'LIVE_TAKEOVER_FORBIDDEN',
    edits: edit(
      LIVE_CLAIM,
      '    and(eq(runs.status, RUN_STATUS.RUNNING), isExpired(timeoutSeconds)),',
      '    sql`false`,',
    ),
  },
  {
    name: 'LIVE_EXPIRED_HOLDS_A_SLOT',
    edits: edit(
      LIVE_CLAIM,
      '          sql`not (${isExpired(params.heartbeatTimeoutSeconds)})`,\n',
      '',
    ),
  },
  {
    name: 'LIVE_BACKTEST_CLAIMED',
    edits: [
      ...edit(
        LIVE_CLAIM,
        '        eq(runs.kind, RUN_KIND.LIVE_PAPER),\n        isNull(users.deletedAt),',
        '        isNull(users.deletedAt),',
      ),
      ...edit(
        LIVE_CLAIM,
        '    eq(runs.kind, RUN_KIND.LIVE_PAPER),\n    isClaimable(params.heartbeatTimeoutSeconds),',
        '    isClaimable(params.heartbeatTimeoutSeconds),',
      ),
    ],
  },
  {
    name: 'LIVE_INACTIVE_OWNER_CLAIMED',
    edits: [
      ...edit(
        LIVE_CLAIM,
        '        isNull(users.blockedAt),\n        isClaimable',
        '        isClaimable',
      ),
      ...edit(
        LIVE_CLAIM,
        '.where(and(eq(users.id, candidate.userId), isNull(users.deletedAt), isNull(users.blockedAt)))',
        '.where(eq(users.id, candidate.userId))',
      ),
    ],
  },
  {
    name: 'LIVE_CLAIM_WITHOUT_HEARTBEAT',
    edits: edit(LIVE_CLAIM, '      heartbeatAt: sql`now()`,\n', ''),
  },
  {
    name: 'LIVE_CANCEL_TOUCHES_BACKTESTS',
    edits: edit(
      LIVE_REPOSITORY,
      '        eq(runs.kind, RUN_KIND.LIVE_PAPER),\n        sql`exists',
      '        sql`exists',
    ),
  },
  {
    name: 'LIVE_CANCEL_IGNORES_THE_OWNER_STATE',
    edits: edit(
      LIVE_REPOSITORY,
      '        sql`exists (select 1 from users owner where owner.id = ${runs.userId} and (owner.deleted_at is not null or owner.blocked_at is not null))`,\n',
      '',
    ),
  },
];

const selected = (Bun.env['QUEUE_MUTANTS'] ?? '').split(',').filter((name) => name.length > 0);

try {
  await runDatabaseMutantSuite({
    label: 'queue',
    judge: 'test-support/run-queue-test.ts',
    mutants:
      selected.length === 0 ? MUTANTS : MUTANTS.filter((mutant) => selected.includes(mutant.name)),
  });
} catch (error: unknown) {
  process.stderr.write(
    `queue-mutants: FALHOU - ${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exitCode = 1;
}
