// Copyright (c) 2026 Ada Technology. All rights reserved.
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';

import { createStreamTicketStore } from '../apps/api-cryptoada/src/stream/stream-ticket-store.js';
import { userIdFromDatabase } from '../packages/database/src/ownership/user-id.js';
import { createSessionHarness, type SessionHarness } from './fixtures/session-harness.fixture.js';
import { signTestToken } from './fixtures/token-signing.fixture.js';

const USER_ID = userIdFromDatabase('0192f3a1-7c4e-7b2a-9d3f-5e6a7b8c9d0e');
const OTHER_USER_ID = userIdFromDatabase('0192f3a1-7c4e-7b2a-9d3f-5e6a7b8c9d0f');
const TIME_TO_LIVE_MILLISECONDS = 30_000;

describe('stream ticket store', () => {
  function createClockedStore(): {
    store: ReturnType<typeof createStreamTicketStore>;
    advance: (ms: number) => void;
  } {
    let nowMilliseconds = 1_000_000;
    return {
      store: createStreamTicketStore({ now: () => nowMilliseconds }),
      advance: (milliseconds): void => {
        nowMilliseconds += milliseconds;
      },
    };
  }

  test('a ticket is consumed once and tied to its user', () => {
    const { store } = createClockedStore();
    const { ticket, expiresInSeconds } = store.issueTicket(USER_ID);
    expect(expiresInSeconds).toBe(30);
    expect(store.consumeTicket(ticket)).toBe(USER_ID);
    expect(store.consumeTicket(ticket)).toBeUndefined();
  });

  test('tickets of different users are never mixed up', () => {
    const { store } = createClockedStore();
    const first = store.issueTicket(USER_ID).ticket;
    const second = store.issueTicket(OTHER_USER_ID).ticket;
    expect(store.consumeTicket(second)).toBe(OTHER_USER_ID);
    expect(store.consumeTicket(first)).toBe(USER_ID);
  });

  test('an unknown or empty ticket is refused', () => {
    const { store } = createClockedStore();
    store.issueTicket(USER_ID);
    expect(store.consumeTicket('unknown-ticket')).toBeUndefined();
    expect(store.consumeTicket('')).toBeUndefined();
  });

  test('a ticket expires after 30 seconds and the attempt does not revive it', () => {
    const { store, advance } = createClockedStore();
    const justInTime = store.issueTicket(USER_ID).ticket;
    advance(TIME_TO_LIVE_MILLISECONDS - 1);
    expect(store.consumeTicket(justInTime)).toBe(USER_ID);
    const late = store.issueTicket(USER_ID).ticket;
    advance(TIME_TO_LIVE_MILLISECONDS);
    expect(store.consumeTicket(late)).toBeUndefined();
  });

  test('tickets carry at least 128 bits of entropy and never repeat', () => {
    const { store } = createClockedStore();
    const tickets = Array.from({ length: 500 }, () => store.issueTicket(USER_ID).ticket);
    expect(new Set(tickets).size).toBe(tickets.length);
    for (const ticket of tickets) {
      expect(Buffer.from(ticket, 'base64url').length).toBeGreaterThanOrEqual(16);
      expect(ticket).toMatch(/^[A-Za-z0-9_-]+$/);
    }
  });
});

describe('POST /v1/stream/tickets', () => {
  let harness: SessionHarness;

  beforeEach(async () => {
    harness = await createSessionHarness();
  });

  afterEach(async () => {
    await harness.stop();
  });

  test('requires a bearer token', async () => {
    const response = await harness.api.sendThroughHandler({
      path: '/v1/stream/tickets',
      method: 'POST',
    });
    expect(response.status).toBe(401);
  });

  test('issues a single-use ticket for the authenticated user', async () => {
    const token = await signTestToken({ key: harness.api.key });
    const response = await harness.api.sendThroughHandler({
      path: '/v1/stream/tickets',
      method: 'POST',
      token,
    });
    const body = (await response.json()) as { data: { ticket: string; expiresInSeconds: number } };
    expect(response.status).toBe(201);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(body.data.expiresInSeconds).toBe(30);
    expect(harness.ticketStore.consumeTicket(body.data.ticket)).toBe(USER_ID);
    expect(harness.ticketStore.consumeTicket(body.data.ticket)).toBeUndefined();
  });

  test('the ticket never reaches the log', async () => {
    const token = await signTestToken({ key: harness.api.key });
    const response = await harness.api.sendThroughHandler({
      path: '/v1/stream/tickets',
      method: 'POST',
      token,
    });
    const body = (await response.json()) as { data: { ticket: string } };
    expect(harness.api.logLines.join('')).not.toContain(body.data.ticket);
  });
});
