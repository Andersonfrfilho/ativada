// Copyright (c) 2026 Ada Technology. All rights reserved.
import {
  createPriceAlertRepository,
  createRunResultRepository,
  type DatabaseHandle,
  type OwnerScope,
} from '../../packages/database/src/index.js';
import type { FakeBinanceStreamServer } from '../../packages/market-data/test-support/fake-binance-stream-server.js';
import { parseJsonContainer } from '../../packages/run-recording/src/index.js';
import { HOUR_MILLISECONDS } from './panel-e2e.constant.js';

// O mesmo canal por onde o worker avisa a API (ADR 0001 §r): o aviso é só um ponteiro, o dado vai para o banco antes.
const RUN_EVENTS_CHANNEL = 'run_events';
const MAX_ENABLED_ALERTS = 50;
const ALERT_VALUE = '65000';

export type ControlParams = {
  readonly handle: DatabaseHandle;
  readonly sql: Bun.SQL;
  readonly scope: OwnerScope;
  readonly runId: string;
  readonly lastOpenTime: number;
  // A Binance falsa que a API consome: o `/tick` do E2E empurra o preço por ela, e o resto (agregação, alerta, socket) é real.
  readonly binance: FakeBinanceStreamServer;
};

export type ControlServer = { readonly url: string; readonly stop: () => Promise<void> };

async function notify(sql: Bun.SQL, payload: Readonly<Record<string, string>>): Promise<void> {
  await sql`SELECT pg_notify(${RUN_EVENTS_CHANNEL}, ${JSON.stringify(payload)})`;
}

// Faz o papel do worker: grava um sinal novo da simulação ao vivo e avisa a API pelo NOTIFY real.
async function pushSignal(params: ControlParams, sequence: number): Promise<void> {
  const candleTime = params.lastOpenTime + sequence * HOUR_MILLISECONDS;
  await createRunResultRepository(params.handle).appendSignals(params.scope, params.runId, [
    {
      candleTime,
      action: 'BUY',
      score: '4',
      regime: 'trending',
      votes: parseJsonContainer('{}'),
      indicators: parseJsonContainer('{}'),
      sentimentObservation: undefined,
      reason: 'Compra 4/4: sinal chegado ao vivo',
    },
  ]);
  await notify(params.sql, { runId: params.runId, kind: 'signal', eventId: String(candleTime) });
}

// Faz o papel do ticker: o alerta cruza o valor (fica desligado, com o instante do disparo) e a API é avisada.
async function pushPriceAlert(params: ControlParams): Promise<void> {
  const created = await createPriceAlertRepository(params.handle).createPriceAlert(params.scope, {
    symbol: 'BTCUSDT',
    direction: 'above',
    value: ALERT_VALUE,
    origin: 'manual',
    maxEnabled: MAX_ENABLED_ALERTS,
  });
  if (created.outcome !== 'created') throw new Error('o alerta de preço do E2E não foi criado');
  const alertId = created.alert.id;
  await params.sql`UPDATE price_alerts SET is_enabled = false, triggered_at = now() WHERE id = ${alertId}`;
  await notify(params.sql, { kind: 'price_alert', alertId });
}

const TICKER_CONNECTION_TIMEOUT_MILLISECONDS = 15_000;
const TICKER_POLL_MILLISECONDS = 50;

async function waitForTickerConnection(binance: FakeBinanceStreamServer): Promise<void> {
  const deadline = Date.now() + TICKER_CONNECTION_TIMEOUT_MILLISECONDS;
  while (binance.openConnectionCount() === 0) {
    if (Date.now() > deadline) throw new Error('a API não conectou ao ticker da Binance falsa');
    await Bun.sleep(TICKER_POLL_MILLISECONDS);
  }
}

type TickBody = { readonly symbol: string; readonly price: string };

function isTickBody(value: unknown): value is TickBody {
  if (typeof value !== 'object' || value === null) return false;
  return (
    typeof Reflect.get(value, 'symbol') === 'string' &&
    typeof Reflect.get(value, 'price') === 'string'
  );
}

// Faz o papel da Binance: um preço novo para o par, no mesmo formato do miniTicker.
async function pushTick(params: ControlParams, request: Request): Promise<void> {
  const body: unknown = await request.json();
  if (!isTickBody(body)) throw new Error('corpo do /tick inválido');
  await waitForTickerConnection(params.binance);
  params.binance.sendTicker({
    symbol: body.symbol,
    price: body.price,
    openPrice: body.price,
    eventTime: Date.now(),
  });
}

export function startControlServer(params: ControlParams): ControlServer {
  let signals = 0;
  const server = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    async fetch(request): Promise<Response> {
      const { pathname } = new URL(request.url);
      if (request.method !== 'POST') return new Response(null, { status: 405 });
      if (pathname === '/signal') await pushSignal(params, (signals += 1));
      else if (pathname === '/price-alert') await pushPriceAlert(params);
      else if (pathname === '/tick') await pushTick(params, request);
      else return new Response(null, { status: 404 });
      return Response.json({ ok: true });
    },
  });
  return {
    url: `http://127.0.0.1:${server.port}`,
    stop: async (): Promise<void> => void (await server.stop(true)),
  };
}
