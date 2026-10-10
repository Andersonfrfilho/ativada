// Copyright (c) 2026 Ada Technology. All rights reserved.
import { runDatabaseMutantSuite, type DatabaseMutant } from './mutants/run-database-mutants.js';

const WRITE = 'src/alerts/alert-write.ts';
const REPOSITORY = 'src/alerts/alert.repository.ts';
const METRICS = 'src/runs/run-metrics.repository.ts';
const MIGRATION = 'drizzle/0013_alerts.sql';

// Cada mutante quebra UMA regra da caixa de saída dos alertas; o juiz roda os checks no Postgres real.
const MUTANTS: readonly DatabaseMutant[] = [
  {
    name: 'ENQUEUES_WITHOUT_A_LINKED_CHAT',
    edits: [
      {
        file: WRITE,
        find: '  if (!(await isTelegramDeliverable(executor, ownerUserId))) return 0;\n',
        replace: '',
      },
    ],
  },
  {
    name: 'SIDE_NOT_PART_OF_THE_KEY',
    edits: [
      {
        file: MIGRATION,
        find: '("run_id","candle_time","side","channel");',
        replace: '("run_id","candle_time","channel");',
      },
    ],
  },
  {
    name: 'DUPLICATE_ALERT_RAISES_INSTEAD_OF_BEING_IGNORED',
    edits: [
      {
        file: WRITE,
        find: '    .onConflictDoNothing({\n      target: [alerts.runId, alerts.candleTime, alerts.side, alerts.channel],\n    })\n',
        replace: '',
      },
    ],
  },
  {
    name: 'NO_LEASE_ON_CLAIM',
    edits: [
      {
        file: REPOSITORY,
        find: '        lockedUntil: new Date(params.now.getTime() + params.leaseMilliseconds),\n',
        replace: '',
      },
    ],
  },
  {
    name: 'CLAIM_DOES_NOT_COUNT_THE_ATTEMPT',
    edits: [
      {
        file: REPOSITORY,
        find: '        attempts: sql`${alerts.attempts} + 1`,\n',
        replace: '',
      },
    ],
  },
  {
    name: 'CHAT_OF_THE_WRONG_OWNER',
    edits: [
      {
        file: REPOSITORY,
        find: 'chatId: chats.get(row.userId),',
        replace: 'chatId: [...chats.values()][0],',
      },
    ],
  },
  {
    name: 'SWITCHED_OFF_ALERTS_STILL_DELIVER',
    edits: [
      {
        file: REPOSITORY,
        find: '        eq(users.alertTelegramEnabled, true),\n',
        replace: '',
      },
    ],
  },
  {
    name: 'FINAL_STATE_CAN_BE_REOPENED',
    edits: [
      {
        file: REPOSITORY,
        find: 'and(eq(alerts.id, alertId), eq(alerts.status, ALERT_STATUS.PENDING))',
        replace: 'eq(alerts.id, alertId)',
      },
    ],
  },
  {
    name: 'RESCHEDULE_IGNORES_THE_NEW_TIME',
    edits: [
      {
        file: REPOSITORY,
        find: '        .set({ nextAttemptAt, lockedUntil: null, lastError: errorCode })',
        replace: '        .set({ lockedUntil: null, lastError: errorCode })',
      },
    ],
  },
  {
    name: 'ALERT_FOREIGN_KEY_IGNORES_THE_OWNER',
    edits: [
      {
        file: MIGRATION,
        find: 'FOREIGN KEY ("run_id","user_id") REFERENCES "public"."runs"("id","user_id")',
        replace: 'FOREIGN KEY ("run_id") REFERENCES "public"."runs"("id")',
      },
    ],
  },
  {
    name: 'LATEST_METRICS_OF_ANY_OWNER',
    edits: [
      {
        file: METRICS,
        find: '            ownerCondition(scope, runs.userId),\n',
        replace: '',
      },
    ],
  },
];

try {
  await runDatabaseMutantSuite({
    label: 'alert',
    judge: 'test-support/alert-test.ts',
    mutants: MUTANTS,
  });
} catch (error: unknown) {
  process.stderr.write(
    `alert-mutants: FALHOU - ${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exitCode = 1;
}
