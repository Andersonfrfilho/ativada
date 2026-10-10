// Copyright (c) 2026 Ada Technology. All rights reserved.
import { runDatabaseMutantSuite, type DatabaseMutant } from './mutants/run-database-mutants.js';

const LIST = 'src/run-results/run-log-list.ts';
const RANKS = 'src/run-results/run-log.constant.ts';

// Cada mutante quebra UMA regra do registro cronológico; o juiz roda os checks no Postgres real.
const MUTANTS: readonly DatabaseMutant[] = [
  {
    name: 'SIGNAL_BEFORE_THE_FILL_IN_THE_SAME_CANDLE',
    edits: [
      {
        file: RANKS,
        find: '[RUN_LOG_KIND.FILL]: 1,\n  [RUN_LOG_KIND.SIGNAL]: 2,',
        replace: '[RUN_LOG_KIND.FILL]: 2,\n  [RUN_LOG_KIND.SIGNAL]: 1,',
      },
    ],
  },
  {
    name: 'ORDERED_BY_TIME_ONLY',
    edits: [
      {
        file: LIST,
        find: 'ORDER BY event_time, event_rank, entry_key LIMIT',
        replace: 'ORDER BY event_time LIMIT',
      },
    ],
  },
  {
    name: 'CURSOR_REPEATS_THE_LAST_ROW',
    edits: [
      {
        file: LIST,
        find: 'WHERE (event_time, event_rank, entry_key) > (',
        replace: 'WHERE (event_time, event_rank, entry_key) >= (',
      },
    ],
  },
  {
    name: 'NO_ROW_PAST_THE_PAGE_TO_SIGNAL_THE_NEXT',
    edits: [{ file: LIST, find: 'LIMIT ${limit + 1}', replace: 'LIMIT ${limit}' }],
  },
  {
    name: 'ORDER_TIMED_BY_ITS_LAST_EVENT',
    edits: [
      {
        file: LIST,
        find: 'event_time: sql`created_candle_time`,',
        replace: 'event_time: sql`last_event_candle_time`,',
      },
    ],
  },
  {
    name: 'PRICE_THROUGH_A_FLOAT',
    edits: [
      {
        file: LIST,
        find: 'price: sql`price::text`,\n    limit_price',
        replace: 'price: sql`price::float8::text`,\n    limit_price',
      },
    ],
  },
  {
    name: 'SIGNALS_OF_ANY_OWNER',
    edits: [
      {
        file: LIST,
        find: 'FROM signals WHERE user_id = ${owner} AND run_id = ${runId}',
        replace: 'FROM signals WHERE run_id = ${runId}',
      },
    ],
  },
  {
    name: 'ORDERS_OF_ANY_OWNER',
    edits: [
      {
        file: LIST,
        find: 'FROM orders WHERE user_id = ${owner} AND run_id = ${runId}',
        replace: 'FROM orders WHERE run_id = ${runId}',
      },
    ],
  },
  {
    name: 'FILLS_OF_ANY_OWNER',
    edits: [
      {
        file: LIST,
        find: 'FROM fills WHERE user_id = ${owner} AND run_id = ${runId}',
        replace: 'FROM fills WHERE run_id = ${runId}',
      },
    ],
  },
  {
    name: 'SIGNALS_OF_EVERY_RUN_OF_THE_OWNER',
    edits: [
      {
        file: LIST,
        find: 'FROM signals WHERE user_id = ${owner} AND run_id = ${runId}',
        replace: 'FROM signals WHERE user_id = ${owner}',
      },
    ],
  },
];

try {
  await runDatabaseMutantSuite({
    label: 'runlog',
    judge: 'test-support/run-log-test.ts',
    mutants: MUTANTS,
  });
} catch (error: unknown) {
  process.stderr.write(
    `runlog-mutants: FALHOU - ${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exitCode = 1;
}
