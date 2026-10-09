// Copyright (c) 2026 Ada Technology. All rights reserved.
import { randomBytes } from 'node:crypto';

import type { UserId } from '@crypto/database';

import { hashSecret } from '../shared/crypto/hash-secret.js';
import {
  MAX_PENDING_STREAM_TICKETS,
  STREAM_TICKET_BYTES,
  STREAM_TICKET_TIME_TO_LIVE_MILLISECONDS,
} from './stream-ticket.constant.js';

export type IssuedStreamTicket = {
  readonly ticket: string;
  readonly expiresInSeconds: number;
};

export type StreamTicketStore = {
  readonly issueTicket: (userId: UserId) => IssuedStreamTicket;
  readonly consumeTicket: (ticket: string) => UserId | undefined;
};

export type StreamTicketStoreOptions = {
  readonly now: () => number;
  readonly timeToLiveMilliseconds?: number;
};

type PendingTicket = {
  readonly userId: UserId;
  readonly expiresAtMilliseconds: number;
};

const MILLISECONDS_PER_SECOND = 1000;

export function createStreamTicketStore(options: StreamTicketStoreOptions): StreamTicketStore {
  const timeToLive = options.timeToLiveMilliseconds ?? STREAM_TICKET_TIME_TO_LIVE_MILLISECONDS;
  const pendingTickets = new Map<string, PendingTicket>();

  function evict(nowMilliseconds: number): void {
    for (const [key, pending] of pendingTickets) {
      if (pending.expiresAtMilliseconds <= nowMilliseconds) pendingTickets.delete(key);
    }
    const oldestKey = pendingTickets.keys().next().value;
    if (pendingTickets.size >= MAX_PENDING_STREAM_TICKETS && oldestKey !== undefined) {
      pendingTickets.delete(oldestKey);
    }
  }

  function issueTicket(userId: UserId): IssuedStreamTicket {
    const nowMilliseconds = options.now();
    evict(nowMilliseconds);
    const ticket = randomBytes(STREAM_TICKET_BYTES).toString('base64url');
    pendingTickets.set(hashSecret(ticket), {
      userId,
      expiresAtMilliseconds: nowMilliseconds + timeToLive,
    });
    return { ticket, expiresInSeconds: timeToLive / MILLISECONDS_PER_SECOND };
  }

  function consumeTicket(ticket: string): UserId | undefined {
    const key = hashSecret(ticket);
    const pending = pendingTickets.get(key);
    if (pending === undefined) return undefined;
    pendingTickets.delete(key);
    return pending.expiresAtMilliseconds > options.now() ? pending.userId : undefined;
  }

  return { issueTicket, consumeTicket };
}
