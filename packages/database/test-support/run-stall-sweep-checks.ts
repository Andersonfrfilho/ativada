// Copyright (c) 2026 Ada Technology. All rights reserved.
import { createNotificationListener } from '../src/notifications/notification-listener.js';
import { RUN_EVENTS_CHANNEL } from '../src/run-events/run-event.constant.js';
import { RUN_KIND, RUN_STATUS } from '../src/runs/run.constant.js';
import { createRunStallRepository } from '../src/run-stall/run-stall.repository.js';
import type { RunStallRepository, StallCandidate } from '../src/run-stall/run-stall.types.js';
import type { LifecycleCheckContext } from './account-lifecycle-checks.js';
import { resolvePersistenceOwner, seedRun } from './persistence-seed.js';

const CYCLE_CHAT = '740000001';
const STALE_CHAT = '740000002';
const ROLLBACK_CHAT = '740000003';
const LATE_CHAT = '740000004';
const ACTIVE_CHAT = '740000005';
const STALLED_SINCE = 1_760_000_900_000;
const LAST_CANDLE_TIME = 1_760_000_000_000;
const WAIT_MILLISECONDS = 8_000;
const POLL_MILLISECONDS = 20;
const QUIET_MILLISECONDS = 300;
const STALL_PAYLOAD = { symbol: 'BTCUSDT', timeframe: '1h', stalledSince: STALLED_SINCE } as const;
const RESUME_PAYLOAD = { ...STALL_PAYLOAD, resumedAt: STALLED_SINCE + 7_200_000 } as const;

type AlertRow = { readonly side: string; readonly candle_time: string; readonly status: string };

async function waitUntil(condition: () => boolean, description: string): Promise<void> {
  const deadline = Date.now() + WAIT_MILLISECONDS;
  while (!condition()) {
    if (Date.now() > deadline) throw new Error(`tempo esgotado: ${description}`);
    await Bun.sleep(POLL_MILLISECONDS);
  }
}

async function startRunningRun(
  context: LifecycleCheckContext,
  params: { readonly subject: string; readonly chat: string | undefined },
): Promise<{ readonly runId: string; readonly userId: string }> {
  const owner = await resolvePersistenceOwner(context.handle, params.subject);
  const run = await seedRun(context.handle, owner, { kind: RUN_KIND.LIVE_PAPER });
  if (params.chat !== undefined) {
    await context.client`UPDATE users SET telegram_chat_id = ${params.chat} WHERE id = ${owner.userId}`;
  }
  await context.client`UPDATE runs SET status = ${RUN_STATUS.RUNNING}, started_at = now(),
    last_candle_time = ${LAST_CANDLE_TIME} WHERE id = ${run.id}`;
  return { runId: run.id, userId: owner.userId };
}

async function findCandidate(
  repository: RunStallRepository,
  runId: string,
): Promise<StallCandidate> {
  const found = await repository.inTransaction(async (session) =>
    (await session.listCandidates()).find((candidate) => candidate.runId === runId),
  );
  if (found === undefined) throw new Error('a execução rodando deveria ser candidata');
  return found;
}

async function readAlerts(client: Bun.SQL, runId: string): Promise<AlertRow[]> {
  const rows: unknown = await client`SELECT side, candle_time::text AS candle_time, status
    FROM alerts WHERE run_id = ${runId} ORDER BY side`;
  return rows as AlertRow[];
}

async function readStalledSince(client: Bun.SQL, runId: string): Promise<string | null> {
  const rows: unknown =
    await client`SELECT stalled_since::text AS value FROM runs WHERE id = ${runId}`;
  return (rows as readonly { value: string | null }[])[0]?.value ?? null;
}

async function checkEpisodeCycle(context: LifecycleCheckContext, raw: string[]): Promise<void> {
  const { handle, client, assertCondition, reportCheck } = context;
  const repository = createRunStallRepository(handle);
  const { runId, userId } = await startRunningRun(context, {
    subject: 'subject-stall-cycle',
    chat: CYCLE_CHAT,
  });
  const candidate = await findCandidate(repository, runId);
  assertCondition(candidate.stalledSince === undefined, 'a execução nasce em dia');
  const opened = await repository.inTransaction((session) =>
    session.openEpisode({ candidate, stalledSince: STALLED_SINCE, alertPayload: STALL_PAYLOAD }),
  );
  const openedAgain = await repository.inTransaction((session) =>
    session.openEpisode({ candidate, stalledSince: STALLED_SINCE, alertPayload: STALL_PAYLOAD }),
  );
  assertCondition(
    opened && !openedAgain,
    'o episódio abre uma vez; a ronda repetida não muda nada',
  );
  assertCondition(
    (await readStalledSince(client, runId)) === String(STALLED_SINCE),
    'stalled_since gravado',
  );
  const open = await findCandidate(repository, runId);
  const closed = await repository.inTransaction((session) =>
    session.closeEpisode({ candidate: open, alertPayload: RESUME_PAYLOAD }),
  );
  const closedAgain = await repository.inTransaction((session) =>
    session.closeEpisode({ candidate: open, alertPayload: RESUME_PAYLOAD }),
  );
  assertCondition(closed && !closedAgain, 'o episódio fecha uma vez');
  assertCondition((await readStalledSince(client, runId)) === null, 'stalled_since apagado');
  // Reabrir o MESMO início (o worker oscilou) não cria um segundo STALL: a chave única é o início do episódio.
  const reopened = await repository.inTransaction((session) =>
    session.openEpisode({ candidate, stalledSince: STALLED_SINCE, alertPayload: STALL_PAYLOAD }),
  );
  const alerts = await readAlerts(client, runId);
  assertCondition(reopened, 'o episódio reabre com o mesmo início');
  assertCondition(
    alerts.map((alert) => alert.side).join(',') === 'RESUME,STALL' &&
      alerts.every(
        (alert) => alert.candle_time === String(STALLED_SINCE) && alert.status === 'pending',
      ),
    `um STALL e um RESUME pendentes no início do episódio: ${JSON.stringify(alerts)}`,
  );
  await waitUntil(() => raw.length >= 3, 'três avisos ao painel');
  const events = raw.map((payload) => JSON.parse(payload) as Record<string, string>);
  assertCondition(
    events.every(
      (event) =>
        event['runId'] === runId &&
        event['kind'] === 'warning' &&
        event['eventId'] === String(STALLED_SINCE) &&
        Object.keys(event).sort().join(',') === 'eventId,kind,runId',
    ),
    'o aviso ao painel é só { runId, kind: warning, eventId }',
  );
  assertCondition(!raw.join('|').includes(userId), 'o aviso não carrega o dono');
  reportCheck(
    'parada: STALL e RESUME únicos por início de episódio, ronda repetida não muda nada, aviso ao painel só com o ponteiro',
  );
}

async function checkGuards(context: LifecycleCheckContext): Promise<void> {
  const { handle, client, assertCondition, reportCheck } = context;
  const repository = createRunStallRepository(handle);
  const stale = await startRunningRun(context, {
    subject: 'subject-stall-stale',
    chat: STALE_CHAT,
  });
  const candidate = await findCandidate(repository, stale.runId);
  await client`UPDATE runs SET last_candle_time = ${LAST_CANDLE_TIME + 3_600_000} WHERE id = ${stale.runId}`;
  const staleOpened = await repository.inTransaction((session) =>
    session.openEpisode({ candidate, stalledSince: STALLED_SINCE, alertPayload: STALL_PAYLOAD }),
  );
  assertCondition(!staleOpened, 'o worker andou depois da leitura: o episódio não abre');
  assertCondition((await readAlerts(client, stale.runId)).length === 0, 'sem episódio, sem alerta');

  const unlinked = await startRunningRun(context, {
    subject: 'subject-stall-unlinked',
    chat: undefined,
  });
  const open = await findCandidate(repository, unlinked.runId);
  await repository.inTransaction((session) =>
    session.openEpisode({
      candidate: open,
      stalledSince: STALLED_SINCE,
      alertPayload: STALL_PAYLOAD,
    }),
  );
  assertCondition(
    (await readStalledSince(client, unlinked.runId)) === String(STALLED_SINCE),
    'sem Telegram a faixa existe',
  );
  await client`UPDATE users SET telegram_chat_id = ${LATE_CHAT} WHERE id = ${unlinked.userId}`;
  const stalled = await findCandidate(repository, unlinked.runId);
  await repository.inTransaction((session) =>
    session.closeEpisode({ candidate: stalled, alertPayload: RESUME_PAYLOAD }),
  );
  assertCondition(
    (await readAlerts(client, unlinked.runId)).length === 0,
    'sem STALL enfileirado não há RESUME',
  );

  await client`UPDATE runs SET stalled_since = ${STALLED_SINCE} WHERE id = ${stale.runId}`;
  await client`UPDATE runs SET status = ${RUN_STATUS.CANCELLED}, finished_at = now() WHERE id = ${stale.runId}`;
  const active = await startRunningRun(context, {
    subject: 'subject-stall-active',
    chat: ACTIVE_CHAT,
  });
  await client`UPDATE runs SET stalled_since = ${STALLED_SINCE} WHERE id = ${active.runId}`;
  const cleared = await repository.inTransaction((session) => session.clearInactiveEpisodes());
  assertCondition(cleared >= 1, 'o episódio de uma execução parada é apagado');
  assertCondition((await readStalledSince(client, stale.runId)) === null, 'marca apagada');
  assertCondition(
    (await readStalledSince(client, active.runId)) === String(STALLED_SINCE),
    'o episódio de uma execução que segue rodando não é apagado',
  );
  assertCondition((await readAlerts(client, stale.runId)).length === 0, 'sem aviso ao parar');
  reportCheck(
    'parada: leitura velha não abre episódio, dono sem Telegram sem alerta, RESUME só atrás de STALL, episódio órfão limpo',
  );
}

async function checkLockAndAtomicity(context: LifecycleCheckContext, raw: string[]): Promise<void> {
  const { handle, client, assertCondition, reportCheck } = context;
  const repository = createRunStallRepository(handle);
  let release: () => void = () => undefined;
  const gate = new Promise<void>((resolve) => void (release = resolve));
  let hasLock = false;
  const holder = repository.inTransaction(async (session) => {
    hasLock = await session.tryAcquireLock();
    await gate;
    return hasLock;
  });
  await waitUntil(() => hasLock, 'a primeira transação pegar a trava');
  const second = await repository.inTransaction((session) => session.tryAcquireLock());
  release();
  assertCondition((await holder) && !second, 'duas varreduras ao mesmo tempo: só uma pega a trava');
  const third = await repository.inTransaction((session) => session.tryAcquireLock());
  assertCondition(third, 'a trava solta no fim da transação');

  const { runId } = await startRunningRun(context, {
    subject: 'subject-stall-rollback',
    chat: ROLLBACK_CHAT,
  });
  const candidate = await findCandidate(repository, runId);
  await Bun.sleep(QUIET_MILLISECONDS);
  const before = raw.length;
  let hasFailed = false;
  try {
    await repository.inTransaction(async (session) => {
      await session.openEpisode({
        candidate,
        stalledSince: STALLED_SINCE,
        alertPayload: STALL_PAYLOAD,
      });
      throw new Error('falha depois de gravar o episódio');
    });
  } catch {
    hasFailed = true;
  }
  await Bun.sleep(QUIET_MILLISECONDS);
  assertCondition(hasFailed, 'a transação deveria falhar');
  assertCondition(
    (await readStalledSince(client, runId)) === null,
    'o rollback desfaz stalled_since',
  );
  assertCondition((await readAlerts(client, runId)).length === 0, 'o rollback leva o alerta junto');
  assertCondition(raw.length === before, 'o rollback não entrega aviso ao painel');
  reportCheck(
    'parada: trava consultiva única entre transações; UPDATE, alerta e aviso na mesma transação (rollback leva os três)',
  );
}

export async function checkRunStallSweep(
  context: LifecycleCheckContext,
  databaseUrl: string,
): Promise<void> {
  const raw: string[] = [];
  const listener = createNotificationListener({
    databaseUrl,
    channel: RUN_EVENTS_CHANNEL,
    onNotification: (payload) => void raw.push(payload),
    onListening: () => undefined,
    onLost: () => undefined,
    reconnectBaseMilliseconds: 50,
    reconnectMaxMilliseconds: 200,
  });
  try {
    await listener.ready;
    await checkEpisodeCycle(context, raw);
    await checkGuards(context);
    await checkLockAndAtomicity(context, raw);
  } finally {
    await listener.close();
  }
}
