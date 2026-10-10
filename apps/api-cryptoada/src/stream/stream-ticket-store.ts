// Copyright (c) 2026 Ada Technology. All rights reserved.
import { randomBytes } from 'node:crypto';

import type { UserId } from '@cryptoada/database';
import { MILLISECONDS_PER_SECOND } from '@cryptoada/environment';

import { createRecencyMap } from '../shared/collections/recency-map.js';
import { hashSecret } from '../shared/crypto/hash-secret.js';
import { BASE64_URL_ENCODING } from '../shared/encoding.constant.js';
import {
  MAX_PENDING_STREAM_TICKETS,
  STREAM_TICKET_BYTES,
  STREAM_TICKET_TIME_TO_LIVE_MILLISECONDS,
} from './stream-ticket.constant.js';

// O que o ticket prova: quem pediu, o assunto do token (para reconferir a conta) e até quando o token dele vale.
export type StreamTicketClaims = {
  readonly userId: UserId;
  readonly keycloakSubject: string;
  readonly sessionExpiresAtMilliseconds: number;
};

export type IssuedStreamTicket = {
  readonly ticket: string;
  readonly expiresInSeconds: number;
};

export type StreamTicketStore = {
  readonly issueTicket: (claims: StreamTicketClaims) => IssuedStreamTicket;
  readonly consumeTicket: (ticket: string) => StreamTicketClaims | undefined;
};

export type StreamTicketStoreOptions = {
  readonly now: () => number;
  readonly timeToLiveMilliseconds?: number;
  readonly maximumEntries?: number;
};

type PendingTicket = {
  readonly claims: StreamTicketClaims;
  readonly expiresAtMilliseconds: number;
};

export function createStreamTicketStore(options: StreamTicketStoreOptions): StreamTicketStore {
  const timeToLive = options.timeToLiveMilliseconds ?? STREAM_TICKET_TIME_TO_LIVE_MILLISECONDS;
  const nowMilliseconds = options.now;
  const pendingTickets = createRecencyMap<PendingTicket>({
    maximumEntries: options.maximumEntries ?? MAX_PENDING_STREAM_TICKETS,
    isIdle: (pending) => pending.expiresAtMilliseconds <= nowMilliseconds(),
  });

  function issueTicket(claims: StreamTicketClaims): IssuedStreamTicket {
    const ticket = randomBytes(STREAM_TICKET_BYTES).toString(BASE64_URL_ENCODING);
    pendingTickets.set(hashSecret(ticket), {
      claims,
      expiresAtMilliseconds: nowMilliseconds() + timeToLive,
    });
    return { ticket, expiresInSeconds: timeToLive / MILLISECONDS_PER_SECOND };
  }

  function consumeTicket(ticket: string): StreamTicketClaims | undefined {
    const key = hashSecret(ticket);
    const pending = pendingTickets.get(key);
    if (pending === undefined) return undefined;
    pendingTickets.delete(key);
    return pending.expiresAtMilliseconds > options.now() ? pending.claims : undefined;
  }

  return { issueTicket, consumeTicket };
}
