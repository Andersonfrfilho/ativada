// Copyright (c) 2026 Ada Technology. All rights reserved.
import {
  createCandleRepository,
  createPriceAlertRepository,
  createRunResultRepository,
  type DatabaseHandle,
  type OwnerScope,
} from '../../packages/database/src/index.js';
import type { FakeBinanceStreamServer } from '../../packages/market-data-crypto/test-support/fake-binance-stream-server.js';
import { parseJsonContainer } from '../../packages/run-recording/src/index.js';
import { EXCHANGE, HOUR_MILLISECONDS, SYMBOLS } from './panel-e2e.constant.js';
import { DECISION_INDICATORS, DECISION_VOTES, votesFor } from './panel-e2e-decision.constant.js';

// O mesmo canal por onde o worker avisa a API (ADR 0001 §r): o aviso é só um ponteiro, o dado vai para o banco antes.
const RUN_EVENTS_CHANNEL = 'run_events';
const MAX_ENABLED_ALERTS = 50;
const ALERT_VALUE = '65000';
// Uma operação de teste na simulação ao vivo (contas à mão, taxa de 0,1%): compra 0,01 a 61.250 (pago 613,1125) e venda a
// 61.500 (recebido 614,385; resultado 1,2725). A compra cai duas velas antes da última vela de 1 h do seed e a venda uma antes.
const FILL_ENTRY_KEY = 'e2e-trade-1';
const FILL_QUANTITY = '0.01';
const FILL_BUY_PRICE = '61250';
const FILL_SELL_PRICE = '61500';
const FILL_BUY_FEE = '0.6125';
const FILL_SELL_FEE = '0.615';
const FILL_NET_PROFIT = '1.2725';
// As decisões de esperar ficam 10 velas à frente dos sinais de compra, para nunca dividirem a mesma vela.
const DECISION_OFFSET_HOURS = 10;
const STALL_AGE_MILLISECONDS = 20 * 60_000;

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

// A rota de decisões lê o fechamento da vela pela chave (par, vela, abertura): uma vela depois do relógio de verdade só entra
// com um "agora" adiantado no repositório.
async function upsertHourCandle(params: ControlParams, candleTime: number): Promise<void> {
  const close = '61500.00';
  await createCandleRepository(params.handle, {
    now: () => candleTime + 2 * HOUR_MILLISECONDS,
  }).upsertCandles([
    {
      exchange: EXCHANGE,
      symbol: SYMBOLS[0],
      timeframe: '1h' as const,
      openTime: candleTime,
      closeTime: candleTime + HOUR_MILLISECONDS - 1,
      open: close,
      high: close,
      low: close,
      close,
      volume: '10.00',
      tradeCount: 1,
    },
  ]);
}

// Faz o papel do worker: grava um sinal novo da simulação ao vivo e avisa a API pelo NOTIFY real.
async function pushSignal(params: ControlParams, sequence: number): Promise<void> {
  const candleTime = params.lastOpenTime + sequence * HOUR_MILLISECONDS;
  await upsertHourCandle(params, candleTime);
  await createRunResultRepository(params.handle).appendSignals(params.scope, params.runId, [
    {
      candleTime,
      action: 'BUY',
      score: '4',
      regime: 'trending',
      votes: parseJsonContainer(JSON.stringify(votesFor(1))),
      indicators: parseJsonContainer(JSON.stringify(DECISION_INDICATORS)),
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

// Uma decisão de ESPERAR (HOLD) nova, no papel do worker: a vela fechada, o sinal com os votos, o ponto de patrimônio e o aviso.
// O saldo sobe para 10.500,00 (o acompanhamento mostra o saldo do último ponto); a vela vem depois do relógio de verdade, então o
// repositório recebe um "agora" adiantado só para aceitá-la.
async function pushDecision(params: ControlParams, sequence: number): Promise<void> {
  const candleTime = params.lastOpenTime + (DECISION_OFFSET_HOURS + sequence) * HOUR_MILLISECONDS;
  await upsertHourCandle(params, candleTime);
  const results = createRunResultRepository(params.handle);
  await results.appendEquityPoints(params.scope, params.runId, [
    { candleTime, equity: '10500.00', equityAtLow: '10500.00', benchmark: '10110.00' },
  ]);
  await results.appendSignals(params.scope, params.runId, [
    {
      candleTime,
      action: 'HOLD',
      score: '0',
      regime: 'ranging',
      votes: parseJsonContainer(JSON.stringify(DECISION_VOTES)),
      indicators: parseJsonContainer(JSON.stringify(DECISION_INDICATORS)),
      sentimentObservation: undefined,
      reason: 'Espera 0/4: nenhuma regra a favor',
    },
  ]);
  await params.sql`UPDATE runs SET last_candle_time = GREATEST(COALESCE(last_candle_time, 0), ${candleTime}) WHERE id = ${params.runId}`;
  await notify(params.sql, { runId: params.runId, kind: 'signal', eventId: String(candleTime) });
  await notify(params.sql, { runId: params.runId, kind: 'balance', eventId: String(candleTime) });
}

type FillSide = 'buy' | 'sell';

function isFillSide(value: unknown): value is FillSide {
  return value === 'buy' || value === 'sell';
}

// Faz o papel do worker: grava a posição e o preenchimento (compra ou venda), avança `last_candle_time` (o gráfico ao vivo
// para na última vela processada) e avisa a API pelo NOTIFY real, tudo nessa ordem: o aviso nunca precede o dado.
async function pushFill(params: ControlParams, side: FillSide): Promise<void> {
  const isBuy = side === 'buy';
  const candleTime = params.lastOpenTime - (isBuy ? 2 : 1) * HOUR_MILLISECONDS;
  const openedCandleTime = params.lastOpenTime - 2 * HOUR_MILLISECONDS;
  const results = createRunResultRepository(params.handle);
  await results.appendPositions(params.scope, params.runId, [
    {
      engineKey: FILL_ENTRY_KEY,
      status: isBuy ? 'open' : 'closed',
      entryPrice: FILL_BUY_PRICE,
      quantity: FILL_QUANTITY,
      stopPrice: '60000',
      targetPrice: FILL_SELL_PRICE,
      entryFee: FILL_BUY_FEE,
      exitPrice: isBuy ? undefined : FILL_SELL_PRICE,
      exitFee: isBuy ? undefined : FILL_SELL_FEE,
      netProfit: isBuy ? undefined : FILL_NET_PROFIT,
      exitReason: isBuy ? undefined : 'target',
      openedCandleTime,
      closedCandleTime: isBuy ? undefined : candleTime,
    },
  ]);
  await results.appendFills(params.scope, params.runId, [
    {
      orderKey: `${FILL_ENTRY_KEY}:${side}`,
      positionKey: FILL_ENTRY_KEY,
      candleTime,
      side,
      price: isBuy ? FILL_BUY_PRICE : FILL_SELL_PRICE,
      quantity: FILL_QUANTITY,
      notional: isBuy ? '612.5' : '615',
      fee: isBuy ? FILL_BUY_FEE : FILL_SELL_FEE,
    },
  ]);
  await params.sql`UPDATE runs SET last_candle_time = GREATEST(COALESCE(last_candle_time, 0), ${candleTime}) WHERE id = ${params.runId}`;
  await notify(params.sql, { runId: params.runId, kind: 'trade', eventId: String(candleTime) });
}

type StallAction = 'stall' | 'resume';

function isStallAction(value: unknown): value is StallAction {
  return value === 'stall' || value === 'resume';
}

async function readStallAction(request: Request): Promise<StallAction> {
  const body: unknown = await request.json();
  const action: unknown =
    typeof body === 'object' && body !== null ? Reflect.get(body, 'action') : undefined;
  if (!isStallAction(action)) throw new Error('corpo do /stall inválido');
  return action;
}

// Faz o papel da varredura da API (spec 006): marca ou limpa `runs.stalled_since` e avisa o painel pelo NOTIFY real
// (`warning`); o painel relê a execução e mostra ou tira a faixa de parada. A marca é de ~20 min atrás, como a de um episódio real.
async function pushStall(params: ControlParams, action: StallAction): Promise<void> {
  const stalledSince = Date.now() - STALL_AGE_MILLISECONDS;
  if (action === 'stall') {
    await params.sql`UPDATE runs SET stalled_since = ${stalledSince} WHERE id = ${params.runId}`;
  } else {
    await params.sql`UPDATE runs SET stalled_since = NULL WHERE id = ${params.runId}`;
  }
  await notify(params.sql, { runId: params.runId, kind: 'warning', eventId: String(stalledSince) });
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

async function readFillSide(request: Request): Promise<FillSide> {
  const body: unknown = await request.json();
  const side: unknown =
    typeof body === 'object' && body !== null ? Reflect.get(body, 'side') : undefined;
  if (!isFillSide(side)) throw new Error('corpo do /fill inválido');
  return side;
}

export function startControlServer(params: ControlParams): ControlServer {
  let signals = 0;
  let decisions = 0;
  const server = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    async fetch(request): Promise<Response> {
      const { pathname } = new URL(request.url);
      if (request.method !== 'POST') return new Response(null, { status: 405 });
      if (pathname === '/signal') await pushSignal(params, (signals += 1));
      else if (pathname === '/decision') await pushDecision(params, (decisions += 1));
      else if (pathname === '/price-alert') await pushPriceAlert(params);
      else if (pathname === '/tick') await pushTick(params, request);
      else if (pathname === '/fill') await pushFill(params, await readFillSide(request));
      else if (pathname === '/stall') await pushStall(params, await readStallAction(request));
      else return new Response(null, { status: 404 });
      return Response.json({ ok: true });
    },
  });
  return {
    url: `http://127.0.0.1:${server.port}`,
    stop: async (): Promise<void> => void (await server.stop(true)),
  };
}
