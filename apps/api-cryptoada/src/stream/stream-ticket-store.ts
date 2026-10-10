// Copyright (c) 2026 Ada Technology. All rights reserved.
import { randomBytes } from 'node:crypto';

import type { UserId } from '@cryptoada/database';
import { MILLISECONDS_PER_SECOND } from '@cryptoada/environment';

import { createRecencyMap } from '../shared/collections/recency-map.js';
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
  readonly maximumEntries?: number;
};

type PendingTicket = {
  readonly userId: UserId;
  readonly expiresAtMilliseconds: number;
};

export function createStreamTicketStore(options: StreamTicketStoreOptions): StreamTicketStore {
  const timeToLive = options.timeToLiveMilliseconds ?? STREAM_TICKET_TIME_TO_LIVE_MILLISECONDS;
  const nowMilliseconds = options.now;
  const pendingTickets = createRecencyMap<PendingTicket>({
    maximumEntries: options.maximumEntries ?? MAX_PENDING_STREAM_TICKETS,
    isIdle: (pending) => pending.expiresAtMilliseconds <= nowMilliseconds(),
  });

  function issueTicket(userId: UserId): IssuedStreamTicket {
    const ticket = randomBytes(STREAM_TICKET_BYTES).toString('base64url');
    pendingTickets.set(hashSecret(ticket), {
      userId,
      expiresAtMilliseconds: nowMilliseconds() + timeToLive,
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
