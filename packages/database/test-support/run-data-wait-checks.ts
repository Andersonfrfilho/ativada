// Copyright (c) 2026 Ada Technology. All rights reserved.
import { createNotificationListener } from '../src/notifications/notification-listener.js';
import { RUN_EVENT_KIND, RUN_EVENTS_CHANNEL } from '../src/run-events/run-event.constant.js';
import { createRunBatchRepository } from '../src/run-results/run-batch.repository.js';
import type { RunBatchWriter } from '../src/run-results/run-batch.types.js';
import type { DataWaitState } from '../src/runs/run-data-wait.js';
import { RUN_STATUS } from '../src/runs/run.constant.js';
import { createRunRepository } from '../src/runs/run.repository.js';
import type { LifecycleCheckContext } from './account-lifecycle-checks.js';
import { captureErrorCode, resolvePersistenceOwner, seedRun } from './persistence-seed.js';

const CHECK_VIOLATION_SQLSTATE = '23514';
const WAIT_MILLISECONDS = 8_000;
const QUIET_MILLISECONDS = 300;
const POLL_MILLISECONDS = 20;
const SINCE = 1_800_000_000_000;
const OPEN_TIME = 1_799_990_000_000;

async function waitUntil(condition: () => boolean, description: string): Promise<void> {
  const deadline = Date.now() + WAIT_MILLISECONDS;
  while (!condition()) {
    if (Date.now() > deadline) throw new Error(`tempo esgotado: ${description}`);
    await Bun.sleep(POLL_MILLISECONDS);
  }
}

type WaitRow = {
  readonly waiting_since: string | null;
  readonly waiting_open_time: string | null;
  readonly waiting_failed_recoveries: number;
};

async function readWait(context: LifecycleCheckContext, runId: string): Promise<WaitRow> {
  const rows: unknown = await context.client.unsafe(
    'SELECT waiting_since, waiting_open_time, waiting_failed_recoveries FROM runs WHERE id = $1',
    [runId],
  );
  const row = (rows as readonly WaitRow[])[0];
  if (row === undefined) throw new Error('execução sumiu');
  return row;
}

async function startRun(
  context: LifecycleCheckContext,
  subject: string,
): Promise<{ owner: Awaited<ReturnType<typeof resolvePersistenceOwner>>; runId: string }> {
  const owner = await resolvePersistenceOwner(context.handle, subject);
  const run = await seedRun(context.handle, owner);
  await createRunRepository(context.handle).transitionRun(owner.scope, {
    runId: run.id,
    to: RUN_STATUS.RUNNING,
  });
  return { owner, runId: run.id };
}

export async function checkRunDataWait(
  context: LifecycleCheckContext,
  databaseUrl: string,
): Promise<void> {
  const { handle, assertCondition, reportCheck } = context;
  const raw: string[] = [];
  const listener = createNotificationListener({
    databaseUrl,
    channel: RUN_EVENTS_CHANNEL,
    onNotification: (payload) => void raw.push(payload),
    onListening: () => undefined,
    onLost: () => undefined,
  });
  try {
    await listener.ready;
    const { owner, runId } = await startRun(context, 'subject-data-wait');
    const batches = createRunBatchRepository(handle);
    const record = (
      params: Parameters<RunBatchWriter['recordDataWait']>[0],
    ): Promise<DataWaitState | undefined> =>
      batches.runInBatch(owner.scope, runId, (writer) => writer.recordDataWait(params));

    const first = await record({ openTime: OPEN_TIME, now: SINCE, lastCleanRecoveryAt: 0 });
    assertCondition(
      first?.isNew === true && first.since === SINCE && first.failedRecoveries === 0,
      'a primeira espera nasce nova, sem recuperação contada',
    );
    await waitUntil(() => raw.length >= 1, 'aviso da espera depois do COMMIT');
    const event = JSON.parse(raw[0] ?? '{}') as Record<string, unknown>;
    assertCondition(
      event['kind'] === RUN_EVENT_KIND.WARNING &&
        event['runId'] === runId &&
        event['eventId'] === String(SINCE) &&
        Object.keys(event).sort().join(',') === 'eventId,kind,runId',
      `o aviso é só { runId, kind: warning, eventId }: ${raw[0]}`,
    );

    const same = await record({
      openTime: OPEN_TIME,
      now: SINCE + 5,
      lastCleanRecoveryAt: SINCE - 1,
    });
    assertCondition(
      same?.isNew === false && same.since === SINCE && same.failedRecoveries === 0,
      'repetir a espera não recomeça nem conta a recuperação anterior ao início',
    );
    const counted = await record({
      openTime: OPEN_TIME,
      now: SINCE + 6,
      lastCleanRecoveryAt: SINCE + 10,
    });
    const again = await record({
      openTime: OPEN_TIME,
      now: SINCE + 7,
      lastCleanRecoveryAt: SINCE + 10,
    });
    const next = await record({
      openTime: OPEN_TIME,
      now: SINCE + 8,
      lastCleanRecoveryAt: SINCE + 20,
    });
    assertCondition(
      counted?.failedRecoveries === 1 &&
        again?.failedRecoveries === 1 &&
        next?.failedRecoveries === 2,
      `a mesma recuperação conta uma vez: ${counted?.failedRecoveries}/${again?.failedRecoveries}/${next?.failedRecoveries}`,
    );
    await Bun.sleep(QUIET_MILLISECONDS);
    assertCondition(raw.length === 1, `só o início da espera avisa: ${raw.length} avisos`);

    const moved = await record({
      openTime: OPEN_TIME + 3_600_000,
      now: SINCE + 30,
      lastCleanRecoveryAt: SINCE + 40,
    });
    assertCondition(
      moved?.isNew === true && moved.since === SINCE + 30 && moved.failedRecoveries === 0,
      'outro buraco recomeça a espera e a contagem',
    );
    await waitUntil(() => raw.length >= 2, 'aviso do novo buraco');

    const cleared = await batches.runInBatch(owner.scope, runId, (writer) =>
      writer.clearDataWait(),
    );
    const row = await readWait(context, runId);
    assertCondition(
      cleared === true &&
        row.waiting_since === null &&
        row.waiting_open_time === null &&
        row.waiting_failed_recoveries === 0,
      'atravessar o buraco apaga a espera',
    );
    const stranger = await resolvePersistenceOwner(handle, 'subject-data-wait-stranger');
    const foreign = await batches.runInBatch(stranger.scope, runId, (writer) =>
      writer.recordDataWait({ openTime: OPEN_TIME, now: SINCE, lastCleanRecoveryAt: 0 }),
    );
    assertCondition(foreign === undefined, 'outro dono gravou espera na execução alheia');
    const queued = await seedRun(handle, owner);
    const notRunning = await batches.runInBatch(owner.scope, queued.id, (writer) =>
      writer.recordDataWait({ openTime: OPEN_TIME, now: SINCE, lastCleanRecoveryAt: 0 }),
    );
    assertCondition(notRunning === undefined, 'execução que não está running gravou espera');
    const unpaired = await captureErrorCode(
      context.client`UPDATE runs SET waiting_since = 1 WHERE id = ${runId}`,
    );
    assertCondition(unpaired === CHECK_VIOLATION_SQLSTATE, `desde sem candle: ${unpaired}`);
  } finally {
    await listener.close();
  }
  reportCheck(
    'espera por dado: grava desde quando e por qual candle, conta cada recuperação limpa uma vez, avisa só no início, apaga ao atravessar; outro dono e execução parada não gravam; o banco exige o par',
  );
}
