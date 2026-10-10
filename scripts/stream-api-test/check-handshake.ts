// Copyright (c) 2026 Ada Technology. All rights reserved.
import { assertCondition } from '../live-test/live-test-context.js';
import { reportLine, type StreamApiContext, type UpgradeAttempt } from './stream-api-context.js';
import { FOREIGN_ORIGIN, SUBJECT } from './stream-api-test.constant.js';

function expectRefused(attempt: UpgradeAttempt, status: number, code: string, label: string): void {
  assertCondition(
    attempt.status === status && attempt.code === code,
    `${label}: ${attempt.status}/${attempt.code}, esperado ${status}/${code}`,
  );
}

// O handshake recusa antes do upgrade: sem ticket, Origin fora da lista, ticket reutilizado e teto de sockets por usuário.
export async function checkHandshake(context: StreamApiContext): Promise<void> {
  expectRefused(await context.attempt({}), 401, 'STREAM_TICKET_INVALID', 'sem ticket');
  expectRefused(
    await context.attempt({ ticket: 'ticket-que-nao-existe' }),
    401,
    'STREAM_TICKET_INVALID',
    'ticket desconhecido',
  );
  expectRefused(
    await context.attempt({ ticket: 'qualquer', origin: null }),
    403,
    'ORIGIN_NOT_ALLOWED',
    'sem Origin',
  );
  const first = await context.issueTicket({ subject: SUBJECT.D });
  expectRefused(
    await context.attempt({ ticket: first, origin: FOREIGN_ORIGIN }),
    403,
    'ORIGIN_NOT_ALLOWED',
    'Origin fora da lista',
  );
  const firstSocket = context.connect({ ticket: first });
  await firstSocket.opened;
  expectRefused(
    await context.attempt({ ticket: first }),
    401,
    'STREAM_TICKET_INVALID',
    'ticket reutilizado',
  );
  const secondSocket = context.connect({
    ticket: await context.issueTicket({ subject: SUBJECT.D }),
  });
  await secondSocket.opened;
  expectRefused(
    await context.attempt({ ticket: await context.issueTicket({ subject: SUBJECT.D }) }),
    429,
    'STREAM_LIMIT_REACHED',
    'terceiro socket do mesmo usuário (teto 2)',
  );
  firstSocket.socket.close();
  secondSocket.socket.close();
  await Promise.all([firstSocket.closed, secondSocket.closed]);
  const joined = context.api.api.logLines.join('\n');
  for (const secret of [first, FOREIGN_ORIGIN]) {
    assertCondition(!joined.includes(secret), 'ticket ou Origin no log da API');
  }
  reportLine(
    'handshake: sem ticket 401, ticket desconhecido 401, sem Origin 403, Origin fora da lista 403 (e o ticket sobrevive à recusa), ticket reutilizado 401, terceiro socket do mesmo usuário 429; nem ticket nem Origin chegam ao log',
  );
}
