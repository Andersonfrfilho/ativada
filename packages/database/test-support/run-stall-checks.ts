// Copyright (c) 2026 Ada Technology. All rights reserved.
import { ALERT_SIDE } from '../src/alerts/alert.constant.js';
import { RUN_KIND } from '../src/runs/run.constant.js';
import type { LifecycleCheckContext } from './account-lifecycle-checks.js';
import { captureErrorCode, resolvePersistenceOwner, seedRun } from './persistence-seed.js';

const CHECK_VIOLATION_SQLSTATE = '23514';
const UNIQUE_VIOLATION_SQLSTATE = '23505';
const STALLED_SINCE = 1_760_000_900_000;
const UNKNOWN_SIDE = 'PAUSE';
const TELEGRAM_CHANNEL = 'telegram';

async function insertAlert(
  context: LifecycleCheckContext,
  params: { readonly userId: string; readonly runId: string; readonly side: string },
): Promise<void> {
  const { client } = context;
  await client`INSERT INTO alerts (id, user_id, run_id, candle_time, side, channel, payload)
    VALUES (${Bun.randomUUIDv7()}, ${params.userId}, ${params.runId}, ${STALLED_SINCE}, ${params.side}, ${TELEGRAM_CHANNEL}, '{}'::jsonb)`;
}

export async function checkRunStall(context: LifecycleCheckContext): Promise<void> {
  const { handle, client, assertCondition, reportCheck } = context;
  const owner = await resolvePersistenceOwner(handle, 'subject-run-stall');
  const run = await seedRun(handle, owner, { kind: RUN_KIND.LIVE_PAPER });
  const identity = { userId: owner.userId, runId: run.id };

  const before: unknown = await client`SELECT stalled_since FROM runs WHERE id = ${run.id}`;
  assertCondition(
    (before as readonly { stalled_since: unknown }[])[0]?.stalled_since === null,
    'a execução nasce em dia (stalled_since nulo)',
  );
  await client`UPDATE runs SET stalled_since = ${STALLED_SINCE} WHERE id = ${run.id}`;
  const after: unknown =
    await client`SELECT stalled_since::text AS value FROM runs WHERE id = ${run.id}`;
  assertCondition(
    (after as readonly { value: string }[])[0]?.value === String(STALLED_SINCE),
    'stalled_since guarda o início do episódio em ms UTC',
  );
  reportCheck('parada: runs.stalled_since nasce nulo e guarda o início do episódio');

  await insertAlert(context, { ...identity, side: ALERT_SIDE.STALL });
  await insertAlert(context, { ...identity, side: ALERT_SIDE.RESUME });
  assertCondition(
    (await captureErrorCode(insertAlert(context, { ...identity, side: ALERT_SIDE.STALL }))) ===
      UNIQUE_VIOLATION_SQLSTATE,
    'o mesmo lado no mesmo início de episódio não duplica',
  );
  assertCondition(
    (await captureErrorCode(insertAlert(context, { ...identity, side: UNKNOWN_SIDE }))) ===
      CHECK_VIOLATION_SQLSTATE,
    'lado desconhecido continua recusado pela CHECK',
  );
  reportCheck(
    'parada: alerts aceita STALL e RESUME, uma vez por início de episódio, e recusa outro lado',
  );
}
