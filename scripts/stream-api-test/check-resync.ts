// Copyright (c) 2026 Ada Technology. All rights reserved.
import { assertCondition, seedCandles } from '../live-test/live-test-context.js';
import type { DeliveryOutcome } from './check-delivery.js';
import { reportLine, type StreamApiContext, type TestSocket } from './stream-api-context.js';
import { EVENT_WAIT_MILLISECONDS, SYMBOL } from './stream-api-test.constant.js';

async function waitForMessage(
  socket: TestSocket,
  description: string,
  matches: (message: unknown) => boolean,
): Promise<void> {
  const deadline = Date.now() + EVENT_WAIT_MILLISECONDS;
  while (!socket.received.some((item) => matches(item.message))) {
    assertCondition(Date.now() < deadline, `tempo esgotado: ${description}`);
    await Bun.sleep(25);
  }
}

function isResync(reason: string): (message: unknown) => boolean {
  return (message) => JSON.stringify(message) === JSON.stringify({ type: 'resync', reason });
}

// Reconexão do LISTEN: a conexão de escuta da API é morta no banco; todo socket recebe `resync` na perda e na volta, o
// LISTEN é refeito e os avisos seguintes voltam a chegar ao dono.
export async function checkResync(
  context: StreamApiContext,
  delivery: DeliveryOutcome,
): Promise<void> {
  const { a, b } = delivery.sockets;
  const before = a.received.length;
  await context.api.client.unsafe(
    "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE application_name = 'cryptoada-listener'",
  );
  for (const socket of [a, b]) {
    await waitForMessage(socket, 'resync na perda', isResync('listener_lost'));
    await waitForMessage(socket, 'resync na volta', isResync('listener_restored'));
  }
  const restoredAt = a.received.findIndex((item) => isResync('listener_restored')(item.message));
  assertCondition(restoredAt >= before, 'o resync da volta veio antes da queda');
  await seedCandles(context.live, delivery.later, { symbol: SYMBOL, allowFuture: true });
  await delivery.tick();
  await waitForMessage(a, 'aviso depois do LISTEN refeito', (message) => {
    const type = (message as { type?: string }).type;
    return type === 'event';
  });
  const afterRestore = a.received.slice(restoredAt + 1);
  assertCondition(
    afterRestore.some((item) => (item.message as { type?: string }).type === 'event'),
    'nenhum aviso chegou depois da reconexão',
  );
  reportLine(
    'reconexão do LISTEN: conexão de escuta morta no banco -> todos os sockets recebem resync (listener_lost e listener_restored), o LISTEN é refeito e os avisos seguintes chegam ao dono',
  );
}
