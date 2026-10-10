// Copyright (c) 2026 Ada Technology. All rights reserved.
import { assertCondition } from '../live-test/live-test-context.js';
import { reportLine, type StreamApiContext, type TestSocket } from './stream-api-context.js';
import {
  EVENT_WAIT_MILLISECONDS,
  SUBJECT,
  TICKER_STALE_SECONDS,
} from './stream-api-test.constant.js';

const PUBLISH_BUDGET_MILLISECONDS = 3_000;

type TickMessage = {
  readonly type: string;
  readonly symbol: string;
  readonly price: string;
  readonly change24h: string | null;
  readonly at: number;
  readonly serverTime: number;
  readonly stale: boolean;
};

function ticksOf(socket: TestSocket): TickMessage[] {
  return socket.received.flatMap((item) => {
    const message = item.message as Partial<TickMessage>;
    return message.type === 'tick' ? [message as TickMessage] : [];
  });
}

async function waitUntil(
  description: string,
  condition: () => boolean,
  milliseconds: number,
): Promise<void> {
  const deadline = Date.now() + milliseconds;
  while (!condition()) {
    assertCondition(Date.now() < deadline, `tempo esgotado: ${description}`);
    await Bun.sleep(25);
  }
}

// O ticker público de verdade: a Binance falsa empurra ticks, a API os agrega (1 por segundo por par) e todo usuário
// autenticado que assinou o par recebe os mesmos bytes; par inexistente é erro tipado; sem tick, o dado é selado como velho.
export async function checkMarket(context: StreamApiContext): Promise<void> {
  const first = context.connect({
    ticket: await context.issueTicket({ subject: SUBJECT.MARKET_A }),
  });
  const second = context.connect({
    ticket: await context.issueTicket({ subject: SUBJECT.MARKET_B }),
  });
  await Promise.all([first.opened, second.opened]);
  for (const socket of [first, second]) {
    socket.send(JSON.stringify({ type: 'subscribe', pairs: ['BTCUSDT'] }));
  }
  first.send(JSON.stringify({ type: 'subscribe', pairs: ['XYZUSDT'] }));
  await waitUntil(
    'subscribed e erro tipado',
    () => first.received.length >= 2 && second.received.length >= 1,
    EVENT_WAIT_MILLISECONDS,
  );
  const refusal = first.received.find(
    (item) => (item.message as { type?: string }).type === 'error',
  );
  assertCondition(
    JSON.stringify(refusal?.message) ===
      JSON.stringify({ type: 'error', code: 'PAIR_NOT_SUPPORTED', pair: 'XYZUSDT' }),
    'par inexistente sem erro tipado',
  );
  await waitUntil(
    'conexão do ticker',
    () => context.binance.openConnectionCount() === 1,
    EVENT_WAIT_MILLISECONDS,
  );
  const sentAt = Date.now();
  for (let index = 1; index <= 100; index += 1) {
    context.binance.sendTicker({
      symbol: 'BTCUSDT',
      price: `${30_000 + index}.00`,
      openPrice: '30000.00',
      eventTime: 7_000_000 + index,
    });
  }
  await waitUntil(
    'tick publicado',
    () => ticksOf(first).length >= 1 && ticksOf(second).length >= 1,
    EVENT_WAIT_MILLISECONDS,
  );
  const latency = Date.now() - sentAt;
  assertCondition(latency < PUBLISH_BUDGET_MILLISECONDS, `tick levou ${latency} ms`);
  await Bun.sleep(1_200);
  assertCondition(
    ticksOf(first).length === 1,
    `100 ticks viraram ${ticksOf(first).length} publicações`,
  );
  assertCondition(
    JSON.stringify(ticksOf(first)[0]) === JSON.stringify(ticksOf(second)[0]),
    'dois usuários receberam ticks diferentes',
  );
  const message = ticksOf(first)[0];
  if (message === undefined) throw new Error('nenhum tick recebido');
  assertCondition(
    message?.price === '30100.00' &&
      message.change24h === '0.3333' &&
      message.at === 7_000_100 &&
      !message.stale,
    `tick fora do esperado: ${JSON.stringify(message)}`,
  );
  assertCondition(
    Math.abs(message.serverTime - Date.now()) < 2_000,
    'serverTime longe do relógio (o desvio da Binance falsa é zero)',
  );
  await waitUntil(
    'selo de dado velho',
    () => ticksOf(first).some((tick) => tick.stale),
    (Number(TICKER_STALE_SECONDS) + 4) * 1_000,
  );
  first.socket.close();
  second.socket.close();
  await Promise.all([first.closed, second.closed]);
  reportLine(
    `ticker público: 100 ticks da Binance viraram 1 publicação em ${latency} ms (30100.00, +0,3333 %), os dois usuários receberam os mesmos bytes, par inexistente = PAIR_NOT_SUPPORTED, e sem tick por ${TICKER_STALE_SECONDS} s o dado foi selado como velho`,
  );
}
