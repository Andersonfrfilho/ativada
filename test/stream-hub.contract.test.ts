// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, test } from 'bun:test';

import {
  createFakeSocket,
  USER_A,
  USER_B,
  type FakeStreamSocket,
} from './fixtures/stream/fake-stream-socket.fixture.js';
import { loadStreamApp } from './fixtures/stream/stream-app.fixture.js';

const { hub: hubModule, constants } = await loadStreamApp();
const MAX_PER_USER = 3;

function openHub(): ReturnType<typeof hubModule.createStreamHub> {
  return hubModule.createStreamHub({ maxSocketsPerUser: MAX_PER_USER });
}

function received(socket: FakeStreamSocket): unknown[] {
  return socket.sent.map((text) => JSON.parse(text) as unknown);
}

describe('stream hub — registry and per-user ceiling', () => {
  test('counts sockets per user and frees the slot when one is removed', () => {
    const hub = openHub();
    const sockets = Array.from({ length: MAX_PER_USER }, () => createFakeSocket());
    for (const socket of sockets) expect(hub.add(socket)).toBe('added');
    expect(hub.countForUser(USER_A)).toBe(MAX_PER_USER);
    expect(hub.add(createFakeSocket())).toBe('limit-reached');
    expect(hub.countForUser(USER_A)).toBe(MAX_PER_USER);
    const first = sockets[0];
    if (first === undefined) throw new Error('sem socket');
    hub.remove(first);
    expect(hub.countForUser(USER_A)).toBe(MAX_PER_USER - 1);
    expect(hub.add(createFakeSocket())).toBe('added');
  });

  test('the ceiling is per user: another user keeps their own slots', () => {
    const hub = openHub();
    for (let index = 0; index < MAX_PER_USER; index += 1) hub.add(createFakeSocket());
    expect(hub.add(createFakeSocket({ userId: USER_B }))).toBe('added');
    expect(hub.size()).toBe(MAX_PER_USER + 1);
  });

  test('removing a socket that was never added changes nothing', () => {
    const hub = openHub();
    hub.add(createFakeSocket());
    hub.remove(createFakeSocket());
    expect(hub.size()).toBe(1);
  });
});

describe('stream hub — fan-out is by user, never broadcast', () => {
  test('sendToUser reaches only the sockets of that user', () => {
    const hub = openHub();
    const firstOfA = createFakeSocket();
    const secondOfA = createFakeSocket();
    const ofB = createFakeSocket({ userId: USER_B });
    for (const socket of [firstOfA, secondOfA, ofB]) hub.add(socket);
    const delivered = hub.sendToUser(USER_A, { type: constants.SERVER_MESSAGE_TYPE.EVENT, n: 1 });
    expect(delivered).toBe(2);
    expect(received(firstOfA)).toStrictEqual([{ type: 'event', n: 1 }]);
    expect(received(secondOfA)).toStrictEqual([{ type: 'event', n: 1 }]);
    expect(ofB.sent).toStrictEqual([]);
  });

  test('sendToUser for a user with no socket delivers to nobody', () => {
    const hub = openHub();
    const ofB = createFakeSocket({ userId: USER_B });
    hub.add(ofB);
    expect(hub.sendToUser(USER_A, { type: 'event' })).toBe(0);
    expect(ofB.sent).toStrictEqual([]);
  });

  test('a socket that throws on send does not stop the delivery to the others', () => {
    const hub = openHub();
    const broken = createFakeSocket();
    const healthy = createFakeSocket();
    broken.isBroken = true;
    hub.add(broken);
    hub.add(healthy);
    expect(hub.sendToUser(USER_A, { type: 'event' })).toBe(1);
    expect(healthy.sent).toHaveLength(1);
  });

  test('broadcast control messages reach every user', () => {
    const hub = openHub();
    const ofA = createFakeSocket();
    const ofB = createFakeSocket({ userId: USER_B });
    hub.add(ofA);
    hub.add(ofB);
    expect(hub.broadcast({ type: 'resync' })).toBe(2);
    expect(received(ofA)).toStrictEqual([{ type: 'resync' }]);
    expect(received(ofB)).toStrictEqual([{ type: 'resync' }]);
  });
});

describe('stream hub — closing', () => {
  test('closeUser closes only that user with the given code and reason', () => {
    const hub = openHub();
    const ofA = createFakeSocket();
    const ofB = createFakeSocket({ userId: USER_B });
    hub.add(ofA);
    hub.add(ofB);
    expect(hub.closeUser(USER_A, constants.WEBSOCKET_CLOSE_CODE.ACCOUNT_BLOCKED, 'conta')).toBe(1);
    expect(ofA.closed).toStrictEqual({ code: 4403, reason: 'conta' });
    expect(ofB.closed).toBeUndefined();
  });

  test('closeAll closes every socket with 1001 (going away)', () => {
    const hub = openHub();
    const sockets = [createFakeSocket(), createFakeSocket({ userId: USER_B })];
    for (const socket of sockets) hub.add(socket);
    hub.closeAll(constants.WEBSOCKET_CLOSE_CODE.GOING_AWAY, 'encerrando');
    expect(sockets.map((socket) => socket.closed?.code)).toStrictEqual([1001, 1001]);
  });

  test('the close codes are the documented ones', () => {
    expect(constants.WEBSOCKET_CLOSE_CODE).toMatchObject({
      GOING_AWAY: 1001,
      TOKEN_EXPIRED: 4401,
      ACCOUNT_BLOCKED: 4403,
    });
  });
});
