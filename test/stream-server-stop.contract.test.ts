// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, test } from 'bun:test';

import { createManualClock } from './fixtures/wait-for.fixture.js';
import { USER_RESOLUTION_STATUS } from '../packages/database/src/index.js';
import { createOwnerScope } from '../packages/database/src/ownership/owner-scope.js';
import { userIdFromDatabase } from '../packages/database/src/ownership/user-id.js';
import { loadStreamApp } from './fixtures/stream/stream-app.fixture.js';

const {
  endpoint: endpointModule,
  ticketStore: ticketModule,
  rateLimiter,
  server,
} = await loadStreamApp();
const USER = userIdFromDatabase('0192f3a1-7c4e-7b2a-9d3f-5e6a7b8c9d0e');
const ORIGIN = 'http://127.0.0.1:56103';
const STOP_BUDGET_MILLISECONDS = 4_000;

describe('startServer — graceful stop with open sockets', () => {
  test('stop() closes the open sockets and resolves inside the shutdown budget', async () => {
    const clock = createManualClock(1_000_000);
    const ticketStore = ticketModule.createStreamTicketStore({ now: clock.now });
    const stream = endpointModule.createStreamEndpoint({
      allowedOrigins: [ORIGIN],
      trustedProxyHops: 0,
      limits: {
        maxSocketsPerUser: 5,
        maxMessageBytes: 4_096,
        pongTimeoutMilliseconds: 60_000,
        maxMessagesPerMinute: 60,
      },
      ticketStore,
      rateLimiter: rateLimiter.createRateLimiter({ now: clock.now }),
      resolveUser: () =>
        Promise.resolve({
          status: USER_RESOLUTION_STATUS.ACTIVE,
          userId: USER,
          scope: createOwnerScope(USER),
        }),
      now: clock.now,
      log: () => undefined,
      reportUnexpectedError: () => undefined,
    });
    stream.setReady(true);
    const started = server.startServer({
      handler: () => Promise.resolve(new Response('sem rota')),
      host: '127.0.0.1',
      port: 0,
      reportUnexpectedError: () => undefined,
      stream,
    });
    const { ticket } = ticketStore.issueTicket({
      userId: USER,
      keycloakSubject: 'subject',
      sessionExpiresAtMilliseconds: clock.now() + 300_000,
    });
    const socket = new WebSocket(`ws://127.0.0.1:${started.port}/v1/stream?ticket=${ticket}`, {
      headers: { Origin: ORIGIN },
    });
    await new Promise<void>((resolve) => {
      socket.onopen = (): void => resolve();
    });
    const closed = new Promise<number>((resolve) => {
      socket.onclose = (event): void => resolve(event.code);
    });
    const stoppedAt = Date.now();
    await started.stop();
    expect(Date.now() - stoppedAt).toBeLessThan(STOP_BUDGET_MILLISECONDS);
    expect([1000, 1001]).toContain(await closed);
    expect(stream.hub.size()).toBe(0);
  });
});
