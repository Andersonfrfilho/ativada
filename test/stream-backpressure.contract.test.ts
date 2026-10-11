// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, test } from 'bun:test';

import {
  createFakeSocket,
  USER_A,
  type FakeStreamSocket,
} from './fixtures/stream/fake-stream-socket.fixture.js';
import { loadStreamApp } from './fixtures/stream/stream-app.fixture.js';

const {
  hub: hubModule,
  constants,
  marketPubSub,
  websocketHandler,
  streamMessage,
  ticketStore,
} = await loadStreamApp();

const DROPPED = 0;
const QUEUED_UNDER_PRESSURE = -1;
const EVENT = { type: constants.SERVER_MESSAGE_TYPE.EVENT, n: 1 };
const RESYNC_TEXT = JSON.stringify({
  type: constants.SERVER_MESSAGE_TYPE.RESYNC,
  reason: constants.RESYNC_REASON.BACKPRESSURE,
});

function openHub(): ReturnType<typeof hubModule.createStreamHub> {
  return hubModule.createStreamHub({ maxSocketsPerUser: 3 });
}

// Descarta o evento (0) e aceita o resto: o cliente perdeu uma mensagem, mas ainda recebe o aviso.
function dropsEvents(): FakeStreamSocket {
  return createFakeSocket({
    sendOutcome: (text) => (text === JSON.stringify(EVENT) ? DROPPED : text.length),
  });
}

describe('stream hub — a slow client is never left silently behind', () => {
  test('a message queued under pressure (-1) is accepted: delivered, nothing sent extra, not closed', () => {
    const hub = openHub();
    const slow = createFakeSocket({ sendOutcome: () => QUEUED_UNDER_PRESSURE });
    hub.add(slow);
    expect(hub.sendToUser(USER_A, EVENT)).toBe(1);
    expect(slow.attempts).toStrictEqual([JSON.stringify(EVENT)]);
    expect(slow.closed).toBeUndefined();
  });

  test('a dropped message (0) is answered with a resync, and the socket stays open', () => {
    const hub = openHub();
    const socket = dropsEvents();
    hub.add(socket);
    expect(hub.sendToUser(USER_A, EVENT)).toBe(0);
    expect(socket.sent).toStrictEqual([RESYNC_TEXT]);
    expect(socket.closed).toBeUndefined();
  });

  test('when not even the resync fits, the socket is closed with 1013 so the client reconnects', () => {
    const hub = openHub();
    const stuck = createFakeSocket({ sendOutcome: () => DROPPED });
    hub.add(stuck);
    expect(hub.sendToUser(USER_A, EVENT)).toBe(0);
    expect(stuck.closed).toStrictEqual({
      code: constants.WEBSOCKET_CLOSE_CODE.TRY_AGAIN_LATER,
      reason: constants.CLOSE_REASON.SLOW_CLIENT,
    });
  });

  test('a slow client does not hold back the others of the same user', () => {
    const hub = openHub();
    const stuck = createFakeSocket({ sendOutcome: () => DROPPED });
    const healthy = createFakeSocket();
    hub.add(stuck);
    hub.add(healthy);
    expect(hub.sendToUser(USER_A, EVENT)).toBe(1);
    expect(healthy.sent).toStrictEqual([JSON.stringify(EVENT)]);
  });

  test('a socket that throws on send is not closed by us and does not stop the others', () => {
    const hub = openHub();
    const broken = createFakeSocket();
    broken.isBroken = true;
    const healthy = createFakeSocket();
    hub.add(broken);
    hub.add(healthy);
    expect(hub.sendToUser(USER_A, EVENT)).toBe(1);
    expect(broken.closed).toBeUndefined();
  });
});

describe('market publish — the same policy for a slow subscriber', () => {
  const TOPIC = 'market:BTCUSDT';
  const TICK = { type: 'tick', symbol: 'BTCUSDT' };

  test('dropped tick: resync, then 1013 when the resync does not fit either', () => {
    const pubsub = marketPubSub.createMarketPubSub();
    const resyncs = createFakeSocket({
      sendOutcome: (text) => (text === JSON.stringify(TICK) ? DROPPED : text.length),
    });
    const stuck = createFakeSocket({ sendOutcome: () => DROPPED });
    const queued = createFakeSocket({ sendOutcome: () => QUEUED_UNDER_PRESSURE });
    for (const socket of [resyncs, stuck, queued]) pubsub.subscribe(TOPIC, socket);
    expect(pubsub.publish(TOPIC, TICK)).toBe(1);
    expect(resyncs.sent).toStrictEqual([RESYNC_TEXT]);
    expect(resyncs.closed).toBeUndefined();
    expect(stuck.closed?.code).toBe(constants.WEBSOCKET_CLOSE_CODE.TRY_AGAIN_LATER);
    expect(queued.closed).toBeUndefined();
  });
});

describe('websocket handler — the server also bounds the backlog of a slow client', () => {
  test('sets the backpressure limit and closes the connection when it is exceeded', () => {
    const handler = websocketHandler.createStreamWebSocketHandler({
      hub: openHub(),
      messages: {} as never,
      maxMessageBytes: 1_024,
      log: () => undefined,
    });
    expect(handler.backpressureLimit).toBe(constants.WEBSOCKET_BACKPRESSURE_LIMIT_BYTES);
    expect(handler.closeOnBackpressureLimit).toBe(true);
  });
});

describe('replies to one socket never throw on a closed socket', () => {
  test('an invalid message answered to a socket that already closed is swallowed', () => {
    const broken = createFakeSocket();
    broken.isBroken = true;
    const dependencies = {
      ticketStore: ticketStore.createStreamTicketStore({ now: () => 1 }),
      resolveUser: (): Promise<never> => Promise.reject(new Error('not used')),
      now: (): number => 1,
      maxMessagesPerMinute: 100,
      reportUnexpectedError: (): void => undefined,
    };
    expect(() =>
      streamMessage.handleStreamMessage(broken, 'não é json', dependencies),
    ).not.toThrow();
  });
});
