// Copyright (c) 2026 Ada Technology. All rights reserved.
import { createNotificationListener } from '../../packages/database/src/notifications/notification-listener.js';
import { RUN_EVENTS_CHANNEL } from '../../packages/database/src/run-events/run-event.constant.js';
import {
  parseRunEventPayload,
  type RunEvent,
} from '../../packages/database/src/run-events/run-event.schema.js';
import { REAL_DATASETS } from '../../test/fixtures/strategy-engine/signal/classic-signals.fixture.js';
import {
  assertCondition,
  cancelRun,
  createLiveRun,
  createProductionEvaluator,
  errorsOf,
  LEAD_IN_CANDLES,
  reportLine,
  seedCandles,
  tickUntilQuiet,
  waitFor,
  type LiveTestContext,
} from './live-test-context.js';

type IdRow = { readonly id: string };
type CandleRow = { readonly candle_time: string };

async function ids(context: LiveTestContext, table: string, runId: string): Promise<string[]> {
  const rows: unknown = await context.client.unsafe(
    `SELECT id::text AS id FROM ${table} WHERE run_id = $1 ORDER BY id`,
    [runId],
  );
  return (rows as readonly IdRow[]).map((row) => row.id);
}

async function candleTimes(context: LiveTestContext, runId: string): Promise<string[]> {
  const rows: unknown = await context.client.unsafe(
    'SELECT candle_time::text AS candle_time FROM equity_points WHERE run_id = $1 ORDER BY candle_time',
    [runId],
  );
  return (rows as readonly CandleRow[]).map((row) => row.candle_time);
}

function eventIdsOf(events: readonly RunEvent[], kind: string): string[] {
  return events
    .filter((event) => event.kind === kind)
    .map((event) => event.eventId)
    .sort();
}

// Cada passo ao vivo avisa a API na MESMA transação (NOTIFY `{ runId, kind, eventId }`): um aviso por sinal, por operação e
// por ponto de saldo gravados — nem a mais nem a menos —, e o candle repetido, cuja transação é desfeita, não avisa nada.
export async function checkStepEvents(context: LiveTestContext): Promise<void> {
  const dataset = REAL_DATASETS[0];
  const first = dataset?.candles[LEAD_IN_CANDLES];
  if (dataset === undefined || first === undefined) throw new Error('sem conjunto real');
  const raw: string[] = [];
  const listener = createNotificationListener({
    databaseUrl: context.databaseUrl,
    channel: RUN_EVENTS_CHANNEL,
    onNotification: (payload) => void raw.push(payload),
    onListening: () => undefined,
    onLost: () => undefined,
  });
  try {
    await listener.ready;
    const run = await createLiveRun(context, {
      symbol: dataset.market.symbol,
      timeframe: '1h',
      periodStart: first.openTime,
    });
    const { evaluator, entries } = createProductionEvaluator(context, { instanceId: 'events' });
    await tickUntilQuiet(evaluator);
    const expected = {
      signal: await ids(context, 'signals', run.id),
      trade: await ids(context, 'fills', run.id),
      balance: await candleTimes(context, run.id),
    };
    const total = expected.signal.length + expected.trade.length + expected.balance.length;
    assertCondition(
      expected.signal.length > 0 && expected.trade.length > 0,
      'a execução não gravou sinal e operação',
    );
    await waitFor(`${total} avisos`, () => Promise.resolve(raw.length >= total));
    const events = raw.flatMap((payload) => parseRunEventPayload(payload) ?? []);
    assertCondition(events.length === raw.length, 'aviso fora do formato { runId, kind, eventId }');
    assertCondition(raw.length === total, `${raw.length} avisos, esperado ${total}`);
    assertCondition(
      events.every((event) => event.runId === run.id),
      'aviso de outra execução',
    );
    for (const [kind, eventIds] of Object.entries(expected)) {
      assertCondition(
        JSON.stringify(eventIdsOf(events, kind)) === JSON.stringify([...eventIds].sort()),
        `avisos de ${kind} não são os das linhas gravadas`,
      );
    }
    await seedCandles(context, dataset.candles);
    const again = await tickUntilQuiet(evaluator);
    await Bun.sleep(300);
    assertCondition(again.steps === 0 && raw.length === total, 'a vela reentregue gerou aviso');
    assertCondition(errorsOf(entries).length === 0, 'erro registrado');
    await cancelRun(context, { runId: run.id });
    reportLine(
      `NOTIFY na transação do passo: ${expected.signal.length} sinais, ${expected.trade.length} operações e ${expected.balance.length} pontos de saldo gravados = ${total} avisos { runId, kind, eventId } exatos, nenhum a mais; a vela reentregue não avisa`,
    );
  } finally {
    await listener.close();
  }
}
