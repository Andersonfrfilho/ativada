// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, test } from 'bun:test';

import { createRefreshDeduplicator } from '../apps/api-ativada/src/session/refresh-deduplicator.js';
import { createStreamTicketStore } from '../apps/api-ativada/src/stream/stream-ticket-store.js';
import { createChatAttemptLimiter } from '../apps/api-ativada/src/telegram/chat-attempt-limiter.js';
import { CHAT_FAILURE_LIMIT } from '../apps/api-ativada/src/telegram/telegram.constant.js';
import { userIdFromDatabase } from '../packages/database/src/ownership/user-id.js';

const USER_ID = userIdFromDatabase('0192f3a1-7c4e-7b2a-9d3f-5e6a7b8c9d0e');
const CLAIMS = {
  userId: USER_ID,
  keycloakSubject: 'subject-bounded',
  sessionExpiresAtMilliseconds: Number.MAX_SAFE_INTEGER,
};
const CEILING = 3;

describe('stream ticket store ceiling', () => {
  test('keeps at most the configured tickets and drops the oldest one first', () => {
    const store = createStreamTicketStore({ now: () => 0, maximumEntries: CEILING });
    const tickets = Array.from({ length: CEILING + 2 }, () => store.issueTicket(CLAIMS).ticket);
    expect(store.consumeTicket(tickets[0] ?? '')).toBeUndefined();
    expect(store.consumeTicket(tickets[1] ?? '')).toBeUndefined();
    for (const ticket of tickets.slice(2))
      expect(store.consumeTicket(ticket)?.userId).toBe(USER_ID);
  });

  test('expired tickets are dropped before a live one', () => {
    let now = 0;
    const store = createStreamTicketStore({
      now: () => now,
      maximumEntries: CEILING,
      timeToLiveMilliseconds: 1_000,
    });
    const expired = store.issueTicket(CLAIMS).ticket;
    now = 900;
    const live = [store.issueTicket(CLAIMS).ticket, store.issueTicket(CLAIMS).ticket];
    now = 1_000;
    store.issueTicket(CLAIMS);
    expect(store.consumeTicket(expired)).toBeUndefined();
    for (const ticket of live) expect(store.consumeTicket(ticket)?.userId).toBe(USER_ID);
  });
});

describe('refresh deduplicator ceiling', () => {
  test('keeps at most the configured entries', async () => {
    const deduplicator = createRefreshDeduplicator<string>({
      now: () => 0,
      windowMilliseconds: 10_000,
      maximumEntries: CEILING,
    });
    const performed: string[] = [];
    const run = (refreshToken: string): Promise<string> =>
      deduplicator.run({
        refreshToken,
        perform: () => {
          performed.push(refreshToken);
          return Promise.resolve(refreshToken);
        },
        shouldRetain: () => true,
      });
    for (const token of ['a', 'b', 'c', 'd', 'e']) await run(token);
    performed.length = 0;
    await run('e');
    await run('d');
    await run('c');
    expect(performed).toStrictEqual([]);
    await run('a');
    expect(performed).toStrictEqual(['a']);
  });
});

describe('chat attempt limiter ceiling', () => {
  function failUntilBlocked(
    limiter: ReturnType<typeof createChatAttemptLimiter>,
    chat: string,
  ): void {
    for (let attempt = 0; attempt < CHAT_FAILURE_LIMIT; attempt += 1) limiter.recordFailure(chat);
  }

  test('keeps at most the configured chats and keeps a blocked chat that is still being used', () => {
    const limiter = createChatAttemptLimiter({ now: () => 0, maximumEntries: CEILING });
    failUntilBlocked(limiter, 'blocked');
    limiter.recordFailure('x1');
    limiter.recordFailure('blocked');
    limiter.recordFailure('x2');
    limiter.recordFailure('x3');
    expect(limiter.isBlocked('blocked')).toBe(true);
    expect(limiter.trackedChatCount()).toBe(CEILING);
  });
});
