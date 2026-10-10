// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { EngineCandle } from '../../packages/strategy-engine/src/index.js';
import { loadClassicScoreboard } from '../../test/fixtures/strategy-engine/engine-scenarios.fixture.js';
import { REAL_DATASETS } from '../../test/fixtures/strategy-engine/signal/classic-signals.fixture.js';
import { dataOf } from '../api-runs-test/api-runs-helpers.js';
import { HOUR_MILLISECONDS } from '../live-test/live-test.constant.js';
import {
  assertCondition,
  createProductionEvaluator,
  errorsOf,
  LEAD_IN_CANDLES,
  seedCandles,
  tickUntilQuiet,
} from '../live-test/live-test-context.js';
import { reportLine, type StreamApiContext, type TestSocket } from './stream-api-context.js';
import {
  ARRIVING_CANDLES,
  DELIVERY_BUDGET_MILLISECONDS,
  EVENT_WAIT_MILLISECONDS,
  SUBJECT,
  SYMBOL,
} from './stream-api-test.constant.js';

type StreamEvent = {
  readonly type: string;
  readonly runId: string;
  readonly kind: string;
  readonly eventId: string;
};

type IdRow = { readonly id: string };

function shift(candles: readonly EngineCandle[], offset: number): EngineCandle[] {
  return candles.map((candle) => ({
    ...candle,
    openTime: candle.openTime + offset,
    closeTime: candle.closeTime + offset,
  }));
}

// A sequência real, deslocada para que o candle de índice `LEAD_IN` seja o corrente: é onde a API começa uma simulação ao vivo.
function shiftToNow(): {
  readonly warmUp: EngineCandle[];
  readonly arriving: EngineCandle[];
  readonly later: EngineCandle[];
} {
  const dataset = REAL_DATASETS[0];
  const anchor = dataset?.candles[LEAD_IN_CANDLES];
  if (dataset === undefined || anchor === undefined) throw new Error('sem conjunto real');
  const startsAt = Math.floor(Date.now() / HOUR_MILLISECONDS) * HOUR_MILLISECONDS;
  const moved = shift(dataset.candles, startsAt - anchor.openTime);
  return {
    warmUp: moved.slice(0, LEAD_IN_CANDLES),
    arriving: moved.slice(LEAD_IN_CANDLES, LEAD_IN_CANDLES + ARRIVING_CANDLES),
    later: moved.slice(LEAD_IN_CANDLES + ARRIVING_CANDLES, LEAD_IN_CANDLES + 2 * ARRIVING_CANDLES),
  };
}

export async function startLiveRun(context: StreamApiContext, subject: string): Promise<string> {
  const strategy = dataOf<{ version: { id: string } }>(
    await context.api.call({
      subject,
      method: 'POST',
      path: '/v1/strategies',
      body: { name: 'Placar do stream', config: loadClassicScoreboard() },
    }),
    201,
  );
  const body = {
    strategyVersionId: strategy.version.id,
    kind: 'live_paper',
    symbol: SYMBOL,
    timeframe: '1h',
  };
  return dataOf<{ id: string }>(
    await context.api.call({ subject, method: 'POST', path: '/v1/runs', body }),
    202,
  ).id;
}

async function rowIds(
  context: StreamApiContext,
  sql: string,
  params: readonly [string, number],
): Promise<string[]> {
  const rows: unknown = await context.api.client.unsafe(sql, [...params]);
  return (rows as readonly IdRow[]).map((row) => row.id).sort();
}

// Só o que o worker gravou DEPOIS de os sockets abrirem: o aquecimento já tinha avisado antes de haver quem ouvisse.
async function expectedIds(
  context: StreamApiContext,
  runId: string,
  fromCandleTime: number,
): Promise<Record<string, string[]>> {
  const params = [runId, fromCandleTime] as const;
  return {
    signal: await rowIds(
      context,
      'SELECT id::text AS id FROM signals WHERE run_id = $1 AND candle_time >= $2::bigint',
      params,
    ),
    trade: await rowIds(
      context,
      'SELECT id::text AS id FROM fills WHERE run_id = $1 AND candle_time >= $2::bigint',
      params,
    ),
    balance: await rowIds(
      context,
      'SELECT candle_time::text AS id FROM equity_points WHERE run_id = $1 AND candle_time >= $2::bigint',
      params,
    ),
  };
}

function eventsOf(socket: TestSocket): StreamEvent[] {
  return socket.received.flatMap((item) => {
    const message = item.message as Partial<StreamEvent>;
    return message.type === 'event' ? [message as StreamEvent] : [];
  });
}

async function waitUntil(description: string, condition: () => boolean): Promise<void> {
  const deadline = Date.now() + EVENT_WAIT_MILLISECONDS;
  while (!condition()) {
    assertCondition(Date.now() < deadline, `tempo esgotado: ${description}`);
    await Bun.sleep(25);
  }
}

function assertOwnEvents(
  socket: TestSocket,
  runId: string,
  expected: Record<string, string[]>,
): void {
  const events = eventsOf(socket);
  assertCondition(
    events.every((event) => event.runId === runId),
    'evento de outra execução no socket',
  );
  assertCondition(socket.received.length === events.length, 'mensagem que não é evento no socket');
  for (const [kind, ids] of Object.entries(expected)) {
    const received = events
      .filter((event) => event.kind === kind)
      .map((event) => event.eventId)
      .sort();
    assertCondition(
      JSON.stringify(received) === JSON.stringify(ids),
      `${kind}: o socket recebeu ${received.length} avisos, as linhas gravadas são ${ids.length}`,
    );
  }
}

export type DeliveryOutcome = {
  readonly runs: { readonly a: string; readonly b: string };
  readonly sockets: { readonly a: TestSocket; readonly b: TestSocket };
  // Os candles que chegam depois: o teste da reconexão os usa para provar que os avisos voltam.
  readonly later: readonly EngineCandle[];
  readonly tick: () => Promise<void>;
};

// Sinal gerado pelo worker chega ao DONO em < 10 s, por todos os sockets dele, e a ninguém mais.
export async function checkDelivery(context: StreamApiContext): Promise<DeliveryOutcome> {
  const { warmUp, arriving, later } = shiftToNow();
  await seedCandles(context.live, warmUp, { symbol: SYMBOL });
  const runA = await startLiveRun(context, SUBJECT.A);
  const runB = await startLiveRun(context, SUBJECT.B);
  const worker = createProductionEvaluator(context.live, { instanceId: 'stream-worker' });
  await tickUntilQuiet(worker.evaluator);
  const firstOfA = context.connect({ ticket: await context.issueTicket({ subject: SUBJECT.A }) });
  const secondOfA = context.connect({ ticket: await context.issueTicket({ subject: SUBJECT.A }) });
  const ofB = context.connect({ ticket: await context.issueTicket({ subject: SUBJECT.B }) });
  await Promise.all([firstOfA.opened, secondOfA.opened, ofB.opened]);
  await seedCandles(context.live, arriving, { symbol: SYMBOL, allowFuture: true });
  const startedAt = Date.now();
  await tickUntilQuiet(worker.evaluator);
  const firstArriving = arriving[0]?.openTime ?? 0;
  const expectedA = await expectedIds(context, runA, firstArriving);
  const expectedB = await expectedIds(context, runB, firstArriving);
  const total = (expected: Record<string, string[]>): number =>
    Object.values(expected).reduce((sum, ids) => sum + ids.length, 0);
  assertCondition(total(expectedA) > 0 && total(expectedB) > 0, 'a execução não gravou nada');
  await waitUntil(
    `todos os avisos nos sockets (A1=${eventsOf(firstOfA).length} A2=${eventsOf(secondOfA).length} B=${eventsOf(ofB).length} esperado A=${total(expectedA)} B=${total(expectedB)})`,
    () =>
      eventsOf(firstOfA).length === total(expectedA) &&
      eventsOf(secondOfA).length === total(expectedA) &&
      eventsOf(ofB).length === total(expectedB),
  );
  const firstEventAt = Math.min(
    ...[firstOfA, secondOfA, ofB].map((socket) => socket.received[0]?.receivedAt ?? Infinity),
  );
  const latency = firstEventAt - startedAt;
  assertCondition(
    latency < DELIVERY_BUDGET_MILLISECONDS,
    `primeiro aviso em ${latency} ms (teto 10 s)`,
  );
  assertOwnEvents(firstOfA, runA, expectedA);
  assertOwnEvents(secondOfA, runA, expectedA);
  assertOwnEvents(ofB, runB, expectedB);
  assertCondition(errorsOf(worker.entries).length === 0, 'erro registrado pelo worker');
  assertCondition(
    context.api.api.logLines.every((line) => !line.includes(runA) || !line.includes('"event"')),
    'dado de evento no log',
  );
  reportLine(
    `entrega: sinal do worker chegou ao dono em ${latency} ms (teto 10 s); A (2 sockets) recebeu ${total(expectedA)} avisos exatos da própria execução, B recebeu ${total(expectedB)} da dele; nenhum aviso cruzou entre os donos`,
  );
  return {
    runs: { a: runA, b: runB },
    sockets: { a: firstOfA, b: ofB },
    later,
    tick: async (): Promise<void> => {
      await tickUntilQuiet(worker.evaluator);
    },
  };
}
