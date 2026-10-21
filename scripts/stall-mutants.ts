// Copyright (c) 2026 Ada Technology. All rights reserved.
import { runDatabaseMutantSuite, type DatabaseMutant } from './mutants/run-database-mutants.js';

const SESSION = 'src/run-stall/run-stall-session.ts';
const ALERT = 'src/run-stall/run-stall-alert.ts';
const REPOSITORY = 'src/run-stall/run-stall.repository.ts';
const LOCK_QUERY =
  'sql`SELECT pg_try_advisory_xact_lock(${STALL_SWEEP_LOCK_KEY}::bigint) AS acquired`';
const CONFLICT_CLAUSE =
  '    .onConflictDoNothing({\n      target: [alerts.runId, alerts.candleTime, alerts.side, alerts.channel],\n    });';
const NOTIFY_CALL = 'await notifyStallChange(executor, { runId: candidate.runId, stalledSince });';

// Cada mutante quebra UMA regra da varredura de parada no banco; o juiz roda os checks no Postgres real.
const MUTANTS: readonly DatabaseMutant[] = [
  {
    name: 'NO_ADVISORY_LOCK',
    edits: [{ file: SESSION, find: LOCK_QUERY, replace: 'sql`SELECT true AS acquired`' }],
  },
  {
    name: 'STALL_ALERT_DUPLICATED_ON_THE_SAME_EPISODE',
    edits: [{ file: ALERT, find: CONFLICT_CLAUSE, replace: '    ;' }],
  },
  {
    name: 'RESUME_WITHOUT_AN_OPEN_STALL',
    edits: [
      {
        file: ALERT,
        find: 'params.side === ALERT_SIDE.RESUME && !(await hasQueuedStall(executor, params))',
        replace: 'false && !(await hasQueuedStall(executor, params))',
      },
    ],
  },
  {
    name: 'ALERT_FOR_AN_OWNER_WITHOUT_TELEGRAM',
    edits: [
      {
        file: ALERT,
        find: 'if (!(await isTelegramDeliverable(executor, userIdFromDatabase(params.userId)))) return;',
        replace: 'void isTelegramDeliverable;',
      },
    ],
  },
  {
    name: 'EPISODE_OPENS_ON_A_STALE_READ',
    edits: [
      {
        file: SESSION,
        find: '        sql`${runs.lastCandleTime} is not distinct from ${candidate.lastCandleTime ?? null}::bigint`,\n',
        replace: '',
      },
    ],
  },
  {
    name: 'OPEN_OVERWRITES_AN_OPEN_EPISODE',
    edits: [{ file: SESSION, find: '        isNull(runs.stalledSince),\n', replace: '' }],
  },
  {
    name: 'CLOSE_ANY_EPISODE_OF_THE_RUN',
    edits: [
      {
        file: SESSION,
        find: 'and(eq(runs.id, candidate.runId), isRunningLiveRun, eq(runs.stalledSince, stalledSince))',
        replace: 'and(eq(runs.id, candidate.runId), isRunningLiveRun)',
      },
    ],
  },
  {
    name: 'PANEL_NOTICE_NEVER_SENT',
    edits: [{ file: SESSION, find: NOTIFY_CALL, replace: '', occurrences: 2 }],
  },
  {
    name: 'STOPPED_RUNS_KEEP_THE_EPISODE_MARK',
    edits: [
      {
        file: SESSION,
        find: 'ne(runs.status, RUN_STATUS.RUNNING),',
        replace: "eq(runs.status, 'never'),",
      },
    ],
  },
  {
    name: 'RUNNING_RUNS_LOSE_THE_EPISODE_MARK',
    edits: [
      {
        file: SESSION,
        find: 'ne(runs.status, RUN_STATUS.RUNNING),',
        replace: "ne(runs.status, 'never'),",
      },
    ],
  },
  {
    name: 'SWEEP_OUTSIDE_ONE_TRANSACTION',
    edits: [
      {
        file: REPOSITORY,
        find: 'database.transaction(async (transaction) => work(createStallSession(transaction))),',
        replace: 'work(createStallSession(database)),',
      },
    ],
  },
];

try {
  await runDatabaseMutantSuite({
    label: 'stall',
    judge: 'test-support/run-stall-test.ts',
    mutants: MUTANTS,
  });
} catch (error: unknown) {
  process.stderr.write(
    `stall-mutants: FALHOU - ${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exitCode = 1;
}
