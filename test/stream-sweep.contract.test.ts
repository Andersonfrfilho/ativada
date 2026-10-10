// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, test } from 'bun:test';

import { createFakeSocket, USER_B } from './fixtures/stream/fake-stream-socket.fixture.js';
import { loadStreamApp } from './fixtures/stream/stream-app.fixture.js';

const { hub: hubModule, sweep, constants } = await loadStreamApp();
const NOW = 1_000_000;
const PONG_TIMEOUT = 60_000;

function sweepAt(hub: ReturnType<typeof hubModule.createStreamHub>, nowMilliseconds: number): void {
  sweep.sweepStreamSockets({ hub, nowMilliseconds, pongTimeoutMilliseconds: PONG_TIMEOUT });
}

describe('stream sweep — token expiry and liveness', () => {
  test('a socket past the token expiry is closed with 4401', () => {
    const hub = hubModule.createStreamHub({ maxSocketsPerUser: 5 });
    const expired = createFakeSocket({
      expiresAtMilliseconds: NOW,
      lastActivityAtMilliseconds: NOW,
    });
    hub.add(expired);
    sweepAt(hub, NOW);
    expect(expired.closed?.code).toBe(constants.WEBSOCKET_CLOSE_CODE.TOKEN_EXPIRED);
  });

  test('a socket before the token expiry is pinged and kept', () => {
    const hub = hubModule.createStreamHub({ maxSocketsPerUser: 5 });
    const alive = createFakeSocket({
      expiresAtMilliseconds: NOW + 1,
      lastActivityAtMilliseconds: NOW,
    });
    hub.add(alive);
    sweepAt(hub, NOW);
    expect(alive.closed).toBeUndefined();
    expect(alive.pings).toHaveLength(1);
  });

  test('a socket that stopped answering for the pong timeout is closed with 4408', () => {
    const hub = hubModule.createStreamHub({ maxSocketsPerUser: 5 });
    const silent = createFakeSocket({ lastActivityAtMilliseconds: NOW - PONG_TIMEOUT });
    hub.add(silent);
    sweepAt(hub, NOW);
    expect(silent.closed?.code).toBe(constants.WEBSOCKET_CLOSE_CODE.PONG_TIMEOUT);
  });

  test('a socket that answered just inside the timeout stays open', () => {
    const hub = hubModule.createStreamHub({ maxSocketsPerUser: 5 });
    const recent = createFakeSocket({ lastActivityAtMilliseconds: NOW - PONG_TIMEOUT + 1 });
    hub.add(recent);
    sweepAt(hub, NOW);
    expect(recent.closed).toBeUndefined();
  });

  test('the sweep acts on each socket on its own', () => {
    const hub = hubModule.createStreamHub({ maxSocketsPerUser: 5 });
    const expired = createFakeSocket({ expiresAtMilliseconds: NOW - 1 });
    const healthy = createFakeSocket({ userId: USER_B, lastActivityAtMilliseconds: NOW });
    hub.add(expired);
    hub.add(healthy);
    sweepAt(hub, NOW);
    expect(expired.closed?.code).toBe(4401);
    expect(healthy.closed).toBeUndefined();
  });

  test('a socket that throws on ping does not stop the sweep of the others', () => {
    const hub = hubModule.createStreamHub({ maxSocketsPerUser: 5 });
    const broken = createFakeSocket({ lastActivityAtMilliseconds: NOW });
    Object.assign(broken, {
      ping: (): never => {
        throw new Error('ping quebrado');
      },
    });
    const next = createFakeSocket({ lastActivityAtMilliseconds: NOW - PONG_TIMEOUT });
    hub.add(broken);
    hub.add(next);
    sweepAt(hub, NOW);
    expect(next.closed?.code).toBe(4408);
  });
});
