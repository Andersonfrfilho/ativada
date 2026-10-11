// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, test } from 'bun:test';

import { ApiError } from '../src/http/api.error.js';
import {
  createStreamClient,
  type SocketHandlers,
  type SocketLike,
  type StreamClientOptions,
  type StreamMessage,
  type StreamStatus,
} from '../src/live/stream-client.js';

class FakeSocket implements SocketLike {
  readonly sent: string[] = [];
  closedWith: number | undefined;
  handlers: SocketHandlers | undefined;

  constructor(readonly ticket: string) {}

  send(data: string): void {
    this.sent.push(data);
  }

  close(code: number): void {
    this.closedWith = code;
  }

  listen(handlers: SocketHandlers): void {
    this.handlers = handlers;
  }

  serverSends(message: unknown): void {
    this.handlers?.message(JSON.stringify(message));
  }
}

type ScheduledTask = { readonly run: () => void; readonly delay: number; isCancelled: boolean };

type Harness = {
  readonly sockets: FakeSocket[];
  readonly statuses: StreamStatus[];
  readonly messages: StreamMessage[];
  readonly resyncs: string[];
  readonly tasks: ScheduledTask[];
  readonly ticketRequests: { count: number };
  readonly refreshes: { count: number };
  readonly options: StreamClientOptions;
  readonly flush: () => Promise<void>;
  readonly runNextTask: () => Promise<void>;
};

function createHarness(overrides: Partial<StreamClientOptions> = {}): Harness {
  const sockets: FakeSocket[] = [];
  const statuses: StreamStatus[] = [];
  const messages: StreamMessage[] = [];
  const resyncs: string[] = [];
  const tasks: ScheduledTask[] = [];
  const ticketRequests = { count: 0 };
  const refreshes = { count: 0 };
  const flush = async (): Promise<void> => {
    for (let turn = 0; turn < 5; turn += 1) await Promise.resolve();
  };
  const options: StreamClientOptions = {
    requestTicket: () => Promise.resolve(`ticket-${(ticketRequests.count += 1)}`),
    refreshSession: () => {
      refreshes.count += 1;
      return Promise.resolve();
    },
    openSocket: (ticket) => {
      const socket = new FakeSocket(ticket);
      sockets.push(socket);
      return socket;
    },
    onStatus: (status): void => void statuses.push(status),
    onMessage: (message) => void messages.push(message),
    onResync: (reason) => void resyncs.push(reason),
    schedule: (run, delay) => {
      const task: ScheduledTask = { run, delay, isCancelled: false };
      tasks.push(task);
      return () => void (task.isCancelled = true);
    },
    now: () => 0,
    random: () => 1,
    ...overrides,
  };
  return {
    sockets,
    statuses,
    messages,
    resyncs,
    tasks,
    ticketRequests,
    refreshes,
    options,
    flush,
    runNextTask: async (): Promise<void> => {
      const task = tasks.find((candidate) => !candidate.isCancelled);
      if (task === undefined) throw new Error('nenhuma tarefa agendada');
      task.isCancelled = true;
      task.run();
      await flush();
    },
  };
}

async function openFirst(harness: Harness): Promise<FakeSocket> {
  createStreamClient(harness.options).start();
  await harness.flush();
  const socket = harness.sockets[0];
  if (socket === undefined) throw new Error('o socket não abriu');
  socket.handlers?.open();
  return socket;
}

describe('stream client', () => {
  test('asks for a single-use ticket, connects with it and goes live', async () => {
    const harness = createHarness();
    const socket = await openFirst(harness);
    expect(socket.ticket).toBe('ticket-1');
    expect(harness.statuses).toStrictEqual(['connecting', 'live']);
  });

  test('delivers run events and price alerts, ignores anything else', async () => {
    const harness = createHarness();
    const socket = await openFirst(harness);
    socket.serverSends({ type: 'event', runId: 'r1', kind: 'signal', eventId: 'e1', at: 1 });
    socket.serverSends({ type: 'price_alert', alertId: 'a1', at: 2 });
    socket.serverSends({ type: 'error', code: 'INVALID_MESSAGE' });
    socket.serverSends({ type: 'strange' });
    socket.handlers?.message('not json');
    expect(harness.messages).toStrictEqual([
      { type: 'event', runId: 'r1', kind: 'signal', eventId: 'e1', at: 1 },
      { type: 'price_alert', alertId: 'a1', at: 2 },
    ]);
  });

  test('a resync from the server asks the panel to refetch over REST', async () => {
    const harness = createHarness();
    const socket = await openFirst(harness);
    socket.serverSends({ type: 'resync', reason: 'listener_lost' });
    expect(harness.resyncs).toStrictEqual(['listener_lost']);
  });

  test('reconnects with a growing wait and refetches once it is back', async () => {
    const harness = createHarness();
    const first = await openFirst(harness);
    first.handlers?.close(1006);
    expect(harness.statuses.at(-1)).toBe('reconnecting');
    const waits: number[] = [];
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const task = harness.tasks.filter((candidate) => !candidate.isCancelled).at(-1);
      waits.push(task?.delay ?? -1);
      await harness.runNextTask();
      harness.sockets.at(-1)?.handlers?.close(1006);
    }
    expect(waits).toStrictEqual([1000, 2000, 4000]);
    await harness.runNextTask();
    harness.sockets.at(-1)?.handlers?.open();
    expect(harness.statuses.at(-1)).toBe('live');
    expect(harness.resyncs).toStrictEqual(['reconnected']);
  });

  test('the wait never passes the ceiling', async () => {
    const harness = createHarness();
    const socket = await openFirst(harness);
    socket.handlers?.close(1006);
    for (let attempt = 0; attempt < 12; attempt += 1) {
      await harness.runNextTask();
      harness.sockets.at(-1)?.handlers?.close(1006);
    }
    // A primeira tarefa é a renovação do socket que abriu; as demais são as esperas de reconexão.
    const delays = harness.tasks.slice(1).map((task) => task.delay);
    expect(Math.max(...delays)).toBeLessThanOrEqual(30_000);
  });

  test('4401 (token expired) reconnects at once with a fresh ticket', async () => {
    const harness = createHarness();
    const socket = await openFirst(harness);
    socket.handlers?.close(4401);
    expect(harness.tasks.some((task) => !task.isCancelled && task.delay === 0)).toBe(true);
    await harness.runNextTask();
    expect(harness.sockets).toHaveLength(2);
    expect(harness.sockets[1]?.ticket).toBe('ticket-2');
  });

  test('4403 (account blocked or deleted) stops for good', async () => {
    const harness = createHarness();
    const socket = await openFirst(harness);
    socket.handlers?.close(4403);
    expect(harness.statuses.at(-1)).toBe('blocked');
    expect(harness.tasks.filter((task) => !task.isCancelled && task.delay >= 0).length).toBe(0);
  });

  test('renews inside the socket with a fresh session and a new ticket before the token ends', async () => {
    const harness = createHarness();
    const socket = await openFirst(harness);
    await harness.runNextTask();
    expect(harness.refreshes.count).toBe(1);
    expect(socket.sent.map((text) => JSON.parse(text) as unknown)).toStrictEqual([
      { type: 'renew', ticket: 'ticket-2' },
    ]);
    socket.serverSends({ type: 'renewed', expiresAt: 600_000 });
    const next = harness.tasks.filter((task) => !task.isCancelled).at(-1);
    expect(next?.delay).toBe(600_000 - 60_000);
  });

  test('a failed renewal closes the socket so it reconnects', async () => {
    let calls = 0;
    const harness = createHarness({
      requestTicket: () =>
        ++calls === 1 ? Promise.resolve('ticket-1') : Promise.reject(new TypeError('offline')),
    });
    const socket = await openFirst(harness);
    await harness.runNextTask();
    expect(socket.closedWith).toBe(4000);
  });

  test('a 401 asking for the ticket means the session ended: stop without retrying', async () => {
    const harness = createHarness({
      requestTicket: () =>
        Promise.reject(new ApiError({ status: 401, code: 'SESSION_REQUIRED', message: 'x' })),
    });
    createStreamClient(harness.options).start();
    await harness.flush();
    expect(harness.statuses.at(-1)).toBe('stopped');
    expect(harness.sockets).toHaveLength(0);
  });

  test('other failures asking for the ticket retry with the wait', async () => {
    let calls = 0;
    const harness = createHarness({
      requestTicket: () =>
        ++calls === 1 ? Promise.reject(new TypeError('offline')) : Promise.resolve('ticket-ok'),
    });
    createStreamClient(harness.options).start();
    await harness.flush();
    expect(harness.statuses.at(-1)).toBe('reconnecting');
    await harness.runNextTask();
    expect(harness.sockets[0]?.ticket).toBe('ticket-ok');
  });

  test('stop closes the socket, cancels timers and never reconnects', async () => {
    const harness = createHarness();
    const client = createStreamClient(harness.options);
    client.start();
    await harness.flush();
    const socket = harness.sockets[0];
    socket?.handlers?.open();
    client.stop();
    expect(socket?.closedWith).toBe(1000);
    socket?.handlers?.close(1000);
    expect(harness.tasks.every((task) => task.isCancelled)).toBe(true);
    expect(harness.statuses.at(-1)).toBe('stopped');
  });
});
