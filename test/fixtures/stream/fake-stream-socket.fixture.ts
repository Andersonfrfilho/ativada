// Copyright (c) 2026 Ada Technology. All rights reserved.
import type {
  StreamSocket,
  StreamSocketData,
} from '../../../apps/api-cryptoada/src/stream/stream-socket.types.js';
import { userIdFromDatabase } from '../../../packages/database/src/ownership/user-id.js';

export const USER_A = userIdFromDatabase('0192f3a1-7c4e-7b2a-9d3f-5e6a7b8c9d0e');
export const USER_B = userIdFromDatabase('0192f3a1-7c4e-7b2a-9d3f-5e6a7b8c9d0f');
export const SUBJECT_A = 'subject-stream-a';
export const SUBJECT_B = 'subject-stream-b';

export type FakeStreamSocket = StreamSocket & {
  // O que o socket ACEITOU (enviado ou na fila); o descartado (0) só entra em `attempts`.
  readonly sent: string[];
  readonly attempts: string[];
  readonly pings: number[];
  closed: { readonly code: number; readonly reason: string } | undefined;
  isBroken: boolean;
};

export type FakeSocketOptions = {
  readonly userId?: typeof USER_A;
  readonly keycloakSubject?: string;
  readonly expiresAtMilliseconds?: number;
  readonly lastActivityAtMilliseconds?: number;
  // O que `send` devolve para cada texto, como o do Bun: bytes enviados, -1 (na fila, com pressão) ou 0 (descartado).
  readonly sendOutcome?: (text: string, attempt: number) => number;
};

let connectionCounter = 0;

export function createFakeSocket(options: FakeSocketOptions = {}): FakeStreamSocket {
  connectionCounter += 1;
  const data: StreamSocketData = {
    connectionId: `connection-${connectionCounter}`,
    userId: options.userId ?? USER_A,
    keycloakSubject: options.keycloakSubject ?? SUBJECT_A,
    expiresAtMilliseconds: options.expiresAtMilliseconds ?? Number.MAX_SAFE_INTEGER,
    lastActivityAtMilliseconds: options.lastActivityAtMilliseconds ?? 0,
    messageWindowStartMilliseconds: 0,
    messageCount: 0,
    subscribedPairs: new Set<string>(),
  };
  const socket: FakeStreamSocket = {
    data,
    sent: [],
    attempts: [],
    pings: [],
    closed: undefined,
    isBroken: false,
    send: (text: string): number => {
      if (socket.isBroken) throw new Error('socket quebrado');
      socket.attempts.push(text);
      const outcome = options.sendOutcome?.(text, socket.attempts.length) ?? text.length;
      if (outcome !== 0) socket.sent.push(text);
      return outcome;
    },
    close: (code: number, reason?: string): void => {
      socket.closed = { code, reason: reason ?? '' };
    },
    ping: (): number => socket.pings.push(Date.now()),
  };
  return socket;
}
