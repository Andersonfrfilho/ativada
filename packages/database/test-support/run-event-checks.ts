// Copyright (c) 2026 Ada Technology. All rights reserved.
import {
  createNotificationListener,
  type NotificationListener,
} from '../src/notifications/notification-listener.js';
import { createRunEventListener } from '../src/run-events/run-event-listener.js';
import type { SessionEnd } from '../src/notifications/session-end.js';
import { parseRunEventPayload, type RunEvent } from '../src/run-events/run-event.schema.js';
import { RUN_EVENT_KIND, RUN_EVENTS_CHANNEL } from '../src/run-events/run-event.constant.js';
import { RUN_STATUS } from '../src/runs/run.constant.js';
import { createRunRepository } from '../src/runs/run.repository.js';
import { createRunBatchRepository } from '../src/run-results/run-batch.repository.js';
import type { RunResultRows } from '../src/run-results/run-batch.types.js';
import type { LifecycleCheckContext } from './account-lifecycle-checks.js';
import {
  buildEquityPoints,
  buildFills,
  buildSignals,
  candleTimeAt,
  resolvePersistenceOwner,
  seedRun,
} from './persistence-seed.js';

const QUIET_MILLISECONDS = 300;
const WAIT_MILLISECONDS = 8_000;
const POLL_MILLISECONDS = 20;

type Collected = {
  readonly raw: string[];
  readonly listening: { readonly attempt: number; readonly isReconnect: boolean }[];
  readonly lost: SessionEnd[];
  readonly listener: NotificationListener;
};

type CountRow = { readonly total: number };

function openCollector(databaseUrl: string): Collected {
  const raw: string[] = [];
  const listening: Collected['listening'][number][] = [];
  const lost: SessionEnd[] = [];
  const listener = createNotificationListener({
    databaseUrl,
    channel: RUN_EVENTS_CHANNEL,
    onNotification: (payload) => void raw.push(payload),
    onListening: (event) => void listening.push(event),
    onLost: (end) => void lost.push(end),
    reconnectBaseMilliseconds: 50,
    reconnectMaxMilliseconds: 200,
  });
  return { raw, listening, lost, listener };
}

async function waitUntil(condition: () => boolean, description: string): Promise<void> {
  const deadline = Date.now() + WAIT_MILLISECONDS;
  while (!condition()) {
    if (Date.now() > deadline) throw new Error(`tempo esgotado: ${description}`);
    await Bun.sleep(POLL_MILLISECONDS);
  }
}

// As linhas de UM passo no candle `index`: um sinal, uma operação e um ponto de saldo.
function stepRows(index = 0): RunResultRows {
  const [fill] = buildFills(1);
  const signal = buildSignals(index + 1)[index];
  const equityPoint = buildEquityPoints(index + 1)[index];
  if (fill === undefined || signal === undefined || equityPoint === undefined) {
    throw new Error('linhas base ausentes');
  }
  return {
    signals: [signal],
    orders: [],
    fills: [{ ...fill, candleTime: candleTimeAt(index) }],
    positions: [],
    equityPoints: [equityPoint],
    commands: [],
  };
}

async function readOne(client: Bun.SQL, query: string, runId: string): Promise<string> {
  const rows: unknown = await client.unsafe(query, [runId]);
  return (rows as readonly { readonly id: string }[])[0]?.id ?? '';
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

function parseAll(raw: readonly string[]): RunEvent[] {
  return raw.flatMap((payload) => parseRunEventPayload(payload) ?? []);
}

async function checkCommitDelivery(
  context: LifecycleCheckContext,
  collected: Collected,
): Promise<void> {
  const { handle, client, assertCondition, reportCheck } = context;
  const { owner, runId } = await startRun(context, 'subject-run-events-a');
  const batches = createRunBatchRepository(handle);
  const published = await batches.runInBatch(owner.scope, runId, async (writer) => {
    await writer.appendResults(stepRows());
    await writer.saveCheckpoint({
      engineState: { marker: 'evento' },
      lastCandleTime: candleTimeAt(0),
      progress: 1,
    });
    const count = await writer.publishStepEvents(candleTimeAt(0));
    await Bun.sleep(QUIET_MILLISECONDS);
    assertCondition(collected.raw.length === 0, 'NOTIFY chegou antes do COMMIT');
    return count;
  });
  assertCondition(published === 3, `eventos publicados: ${published}, esperado 3`);
  await waitUntil(() => collected.raw.length >= 3, 'três eventos depois do COMMIT');
  const events = parseAll(collected.raw);
  const byKind = new Map(events.map((event) => [event.kind, event]));
  const signalId = await readOne(client, 'SELECT id::text FROM signals WHERE run_id = $1', runId);
  const fillId = await readOne(client, 'SELECT id::text FROM fills WHERE run_id = $1', runId);
  assertCondition(byKind.get(RUN_EVENT_KIND.SIGNAL)?.eventId === signalId, 'eventId do sinal');
  assertCondition(byKind.get(RUN_EVENT_KIND.TRADE)?.eventId === fillId, 'eventId da operação');
  assertCondition(
    byKind.get(RUN_EVENT_KIND.BALANCE)?.eventId === String(candleTimeAt(0)),
    'eventId do saldo é o candle',
  );
  assertCondition(
    events.every((event) => event.runId === runId),
    'runId dos eventos',
  );
  const shapes = collected.raw.map((payload) => Object.keys(JSON.parse(payload) as object).sort());
  assertCondition(
    shapes.every((keys) => keys.join(',') === 'eventId,kind,runId'),
    'o payload tem mais que { runId, kind, eventId }',
  );
  const joined = collected.raw.join('|');
  assertCondition(
    !joined.includes(owner.userId) && !joined.includes('price') && !joined.includes('equity'),
    'o payload carrega dono ou valores',
  );
  await checkOnlyTheStepCandle(context, collected, { owner, runId });
  reportCheck(
    'NOTIFY na transação do passo: nada antes do COMMIT, 3 eventos depois ({ runId, kind, eventId } só), sem dono nem valores',
  );
}

type StartedRun = {
  readonly owner: Awaited<ReturnType<typeof resolvePersistenceOwner>>;
  readonly runId: string;
};

// O passo do candle seguinte avisa SÓ do candle dele: as linhas do candle anterior, já avisadas, não voltam.
async function checkOnlyTheStepCandle(
  context: LifecycleCheckContext,
  collected: Collected,
  run: StartedRun,
): Promise<void> {
  const { handle, assertCondition } = context;
  const before = collected.raw.length;
  const published = await createRunBatchRepository(handle).runInBatch(
    run.owner.scope,
    run.runId,
    async (writer) => {
      await writer.appendResults(stepRows(1));
      await writer.saveCheckpoint({
        engineState: { marker: 'segundo' },
        lastCandleTime: candleTimeAt(1),
        progress: 2,
      });
      return writer.publishStepEvents(candleTimeAt(1));
    },
  );
  assertCondition(published === 3, `segundo passo publicou ${published}, esperado 3`);
  await waitUntil(() => collected.raw.length >= before + 3, 'três eventos do segundo passo');
  await Bun.sleep(QUIET_MILLISECONDS);
  assertCondition(collected.raw.length === before + 3, 'o segundo passo avisou de linhas antigas');
  const balance = parseAll(collected.raw.slice(before)).find((event) => event.kind === 'balance');
  assertCondition(balance?.eventId === String(candleTimeAt(1)), 'saldo do segundo passo');
}

async function checkRollbackAndScope(
  context: LifecycleCheckContext,
  collected: Collected,
): Promise<void> {
  const { handle, assertCondition, reportCheck } = context;
  const { owner, runId } = await startRun(context, 'subject-run-events-b');
  const before = collected.raw.length;
  const batches = createRunBatchRepository(handle);
  let failure: unknown;
  try {
    await batches.runInBatch(owner.scope, runId, async (writer) => {
      await writer.appendResults(stepRows());
      await writer.publishStepEvents(candleTimeAt(0));
      throw new Error('falha injetada depois do NOTIFY');
    });
  } catch (error: unknown) {
    failure = error;
  }
  assertCondition(failure instanceof Error, 'o erro não propagou');
  await Bun.sleep(QUIET_MILLISECONDS);
  assertCondition(collected.raw.length === before, 'lote desfeito emitiu NOTIFY');
  const empty = await batches.runInBatch(owner.scope, runId, (writer) =>
    writer.publishStepEvents(candleTimeAt(99)),
  );
  assertCondition(empty === 0, 'candle sem linhas publicou evento');
  const stranger = await resolvePersistenceOwner(handle, 'subject-run-events-stranger');
  const foreign = await batches.runInBatch(stranger.scope, runId, (writer) =>
    writer.publishStepEvents(candleTimeAt(0)),
  );
  assertCondition(foreign === undefined, 'outro dono publicou evento da execução alheia');
  reportCheck(
    'NOTIFY: lote desfeito não emite; candle sem linhas não emite; outro dono não publica',
  );
}

async function checkListenerRecovery(
  context: LifecycleCheckContext,
  collected: Collected,
): Promise<void> {
  const { client, assertCondition, reportCheck } = context;
  const listeningBefore = collected.listening.length;
  await client`SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE application_name = 'ativada-listener'`;
  await waitUntil(
    () => collected.listening.length > listeningBefore,
    'LISTEN refeito depois de matar a conexão',
  );
  const lastLost = collected.lost.at(-1);
  if (lastLost === undefined) throw new Error('a perda da conexão não foi reportada');
  assertCondition(lastLost.wasListening, 'a perda não disse que havia LISTEN');
  assertCondition(
    collected.listening.at(-1)?.isReconnect === true,
    'o LISTEN novo não é reconexão',
  );
  const before = collected.raw.length;
  await client`SELECT pg_notify(${RUN_EVENTS_CHANNEL}, '{"runId":"x","kind":"signal","eventId":"y"}')`;
  await waitUntil(() => collected.raw.length > before, 'evento depois da reconexão');
  reportCheck(
    `conexão de escuta morta (pg_terminate_backend) -> perda ${lastLost.reason}/${lastLost.sqlState}, LISTEN refeito, evento depois da volta entregue`,
  );
}

async function checkAuthentication(
  context: LifecycleCheckContext,
  collected: Collected,
): Promise<void> {
  const { client, assertCondition, reportCheck } = context;
  const rows: unknown = await client`
    SELECT count(*)::int AS total FROM pg_stat_activity
    WHERE application_name = 'ativada-listener' AND state IS NOT NULL`;
  const total = (rows as readonly CountRow[])[0]?.total ?? 0;
  assertCondition(total === 1, `conexões de escuta: ${total}, esperado 1`);
  assertCondition(collected.listener.isListening(), 'o escutador não está escutando');
  reportCheck('autenticação SCRAM-SHA-256 do Postgres real: uma conexão de escuta dedicada');
}

// O escutador de avisos de execução (o que a API usa): entrega só `{ runId, kind, eventId }` válido e conta o resto.
async function checkRunEventListener(
  context: LifecycleCheckContext,
  databaseUrl: string,
): Promise<void> {
  const { client, assertCondition, reportCheck } = context;
  const events: RunEvent[] = [];
  let malformed = 0;
  const listener = createRunEventListener({
    databaseUrl,
    onEvent: (event) => void events.push(event),
    onMalformed: () => {
      malformed += 1;
    },
    onListening: () => undefined,
    onLost: () => undefined,
  });
  try {
    await listener.ready;
    const valid = JSON.stringify({ runId: crypto.randomUUID(), kind: 'signal', eventId: 'e-1' });
    const withOwner = JSON.stringify({
      runId: crypto.randomUUID(),
      kind: 'signal',
      eventId: 'e-2',
      userId: crypto.randomUUID(),
    });
    for (const payload of [valid, withOwner, 'não é json']) {
      await client`SELECT pg_notify(${RUN_EVENTS_CHANNEL}, ${payload})`;
    }
    await waitUntil(() => events.length + malformed >= 3, 'três avisos no escutador');
    assertCondition(events.length === 1 && events[0]?.eventId === 'e-1', 'aviso válido entregue');
    assertCondition(malformed === 2, `avisos fora do formato contados: ${malformed}, esperado 2`);
  } finally {
    await listener.close();
  }
  reportCheck(
    'escutador de avisos: entrega o { runId, kind, eventId } válido; dono no payload e texto solto são descartados e contados',
  );
}

export async function checkRunEvents(
  context: LifecycleCheckContext,
  databaseUrl: string,
): Promise<void> {
  const collected = openCollector(databaseUrl);
  try {
    await collected.listener.ready;
    await checkAuthentication(context, collected);
    await checkCommitDelivery(context, collected);
    await checkRollbackAndScope(context, collected);
    await checkListenerRecovery(context, collected);
    await checkRunEventListener(context, databaseUrl);
  } finally {
    await collected.listener.close();
  }
}
