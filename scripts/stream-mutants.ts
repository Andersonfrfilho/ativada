import { runDatabaseMutantSuite, type DatabaseMutant } from './mutants/run-database-mutants.js';

const PUBLISH = 'src/run-events/publish-step-events.ts';

function edit(file: string, find: string, replace: string): DatabaseMutant['edits'] {
  return [{ file, find, replace }];
}

// Cada mutante quebra UMA regra do aviso do passo ao vivo; o juiz roda os checks do NOTIFY no Postgres real.
const MUTANTS: readonly DatabaseMutant[] = [
  {
    name: 'SIGNAL_EVENT_MISLABELED',
    edits: edit(PUBLISH, "'kind', ${RUN_EVENT_KIND.SIGNAL}", "'kind', ${RUN_EVENT_KIND.TRADE}"),
  },
  {
    name: 'BALANCE_EVENT_POINTS_AT_THE_RUN',
    edits: edit(PUBLISH, "'eventId', candle_time::text", "'eventId', run_id::text"),
  },
  {
    name: 'PAYLOAD_CARRIES_THE_OWNER',
    edits: edit(
      PUBLISH,
      "jsonb_build_object('runId', run_id::text, 'kind', ${RUN_EVENT_KIND.TRADE}",
      "jsonb_build_object('userId', user_id::text, 'runId', run_id::text, 'kind', ${RUN_EVENT_KIND.TRADE}",
    ),
  },
  {
    name: 'FILLS_NEVER_PUBLISHED',
    edits: edit(PUBLISH, 'FROM fills WHERE run_id', 'FROM fills WHERE false AND run_id'),
  },
  {
    name: 'EVERY_CANDLE_OF_THE_RUN_IS_PUBLISHED',
    edits: edit(
      PUBLISH,
      'FROM equity_points WHERE run_id = ${runId} AND user_id = ${ownerUserId} AND candle_time = ${candleTime}',
      'FROM equity_points WHERE run_id = ${runId} AND user_id = ${ownerUserId}',
    ),
  },
  {
    name: 'PUBLISHED_ON_ANOTHER_CHANNEL',
    edits: edit(PUBLISH, 'pg_notify(${RUN_EVENTS_CHANNEL}', "pg_notify('outro_canal'"),
  },
  {
    name: 'EVENTS_CHANNEL_NOT_LISTENED',
    edits: edit(
      'src/run-events/run-event-listener.ts',
      'channel: RUN_EVENTS_CHANNEL,',
      "channel: 'outro_canal',",
    ),
  },
  {
    name: 'LISTENER_DROPS_THE_PAYLOAD_VALIDATION',
    edits: edit(
      'src/run-events/run-event.schema.ts',
      'const runEventSchema = z.strictObject({',
      'const runEventSchema = z.object({',
    ),
  },
];

await runDatabaseMutantSuite({
  label: 'stream',
  judge: 'test-support/run-event-test.ts',
  mutants: MUTANTS,
});
