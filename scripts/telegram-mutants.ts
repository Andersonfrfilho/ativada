// Copyright (c) 2026 Ada Technology. All rights reserved.
import {
  runLiveSourceMutantSuite,
  type LiveSourceMutant,
} from './mutants/run-live-source-mutants.js';

const DATABASE_FILE = 'create-live-run-database.ts';
const IN_STEP_APPEND = '        await writer.appendAlerts(commit.alerts);\n';
const COMMIT_OPENING = '  try {\n    const outcome = await batches.runInBatch(';

// Cada mutante quebra UMA regra do alerta no passo ao vivo que só o Postgres de verdade prova; o juiz é o `telegram-test`.
const MUTANTS: readonly LiveSourceMutant[] = [
  {
    name: 'ALERT_NEVER_APPENDED_TO_THE_STEP',
    edits: [{ file: DATABASE_FILE, find: IN_STEP_APPEND, replace: '' }],
  },
  {
    name: 'ALERT_COMMITS_IN_ITS_OWN_TRANSACTION_BEFORE_THE_STEP',
    edits: [
      { file: DATABASE_FILE, find: IN_STEP_APPEND, replace: '' },
      {
        file: DATABASE_FILE,
        find: COMMIT_OPENING,
        replace: `  await batches.runInBatch(target.scope, target.runId, (own) => own.appendAlerts(commit.alerts));\n${COMMIT_OPENING}`,
      },
    ],
  },
  {
    name: 'HIT_RATE_READ_FROM_THE_WRONG_KIND_OF_RUN',
    edits: [
      {
        file: DATABASE_FILE,
        find: 'kind: RUN_KIND.WALK_FORWARD,',
        replace: 'kind: RUN_KIND.BACKTEST,',
      },
    ],
  },
  {
    name: 'HIT_RATE_READ_FROM_ANOTHER_VERSION',
    edits: [
      {
        file: DATABASE_FILE,
        find: 'strategyVersionId: target.strategyVersionId,',
        replace: "strategyVersionId: '00000000-0000-7000-8000-000000000000',",
      },
    ],
  },
];

try {
  await runLiveSourceMutantSuite({
    label: 'telegram',
    judge: 'scripts/telegram-test.ts',
    mutants: MUTANTS,
  });
} catch (error: unknown) {
  process.stderr.write(
    `telegram-mutants: FALHOU - ${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exitCode = 1;
}
