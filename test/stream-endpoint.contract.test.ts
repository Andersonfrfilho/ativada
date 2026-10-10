// Copyright (c) 2026 Ada Technology. All rights reserved.
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';

import { USER_RESOLUTION_STATUS } from '../packages/database/src/index.js';
import { USER_A, USER_B } from './fixtures/stream/fake-stream-socket.fixture.js';
import {
  ALLOWED_ORIGIN,
  FOREIGN_ORIGIN,
  SESSION_LIFETIME_MILLISECONDS,
  createStreamHarness,
  type StreamHarness,
} from './fixtures/stream/stream-harness.fixture.js';
import { waitFor } from './fixtures/wait-for.fixture.js';

const SUBJECT_A = 'subject-stream-a';
const SUBJECT_B = 'subject-stream-b';
const QUIET_MILLISECONDS = 250;
const RUN_ID = '0192f3a1-7c4e-7b2a-9d3f-5e6a7b8c9a01';

let harness: StreamHarness;
const HEARTBEAT_STEP_MILLISECONDS = 40_000;
const PONG_PAUSE_MILLISECONDS = 80;

// O relógio do teste anda em saltos menores que o timeout do pong, e cada salto dá tempo para o cliente responder ao ping.
async function ageWithHeartbeat(milliseconds: number): Promise<void> {
  for (let elapsed = 0; elapsed < milliseconds; elapsed += HEARTBEAT_STEP_MILLISECONDS) {
    harness.clock.advance(Math.min(HEARTBEAT_STEP_MILLISECONDS, milliseconds - elapsed));
    harness.endpoint.sweep();
    await Bun.sleep(PONG_PAUSE_MILLISECONDS);
  }
}

beforeEach(async () => {
  harness = await createStreamHarness();
});

afterEach(async () => {
  await harness.stop();
});

describe('GET /v1/stream — refused before the upgrade', () => {
  test('a plain HTTP request without the Upgrade header is 426', async () => {
    const attempt = await harness.attempt({
      ticket: harness.issueTicket(SUBJECT_A),
      isUpgrade: false,
    });
    expect(attempt).toStrictEqual({ status: 426, code: 'STREAM_UPGRADE_REQUIRED' });
  });

  test('a missing Origin is refused with 403 and the ticket is not consumed', async () => {
    const ticket = harness.issueTicket(SUBJECT_A);
    expect(await harness.attempt({ ticket, origin: null })).toStrictEqual({
      status: 403,
      code: 'ORIGIN_NOT_ALLOWED',
    });
    const client = harness.connect({ ticket });
    await client.opened;
    client.socket.close();
  });

  test('an Origin outside the allowlist is refused with 403', async () => {
    const attempt = await harness.attempt({
      ticket: harness.issueTicket(SUBJECT_A),
      origin: FOREIGN_ORIGIN,
    });
    expect(attempt).toStrictEqual({ status: 403, code: 'ORIGIN_NOT_ALLOWED' });
  });

  test('no ticket, an unknown ticket and a malformed ticket are all 401 STREAM_TICKET_INVALID', async () => {
    const expected = { status: 401, code: 'STREAM_TICKET_INVALID' };
    expect(await harness.attempt({})).toStrictEqual(expected);
    expect(await harness.attempt({ ticket: 'ticket-que-nao-existe' })).toStrictEqual(expected);
    expect(await harness.attempt({ ticket: 'x'.repeat(500) })).toStrictEqual(expected);
  });

  test('a ticket works once: the second use is refused', async () => {
    const ticket = harness.issueTicket(SUBJECT_A);
    const first = harness.connect({ ticket });
    await first.opened;
    expect(await harness.attempt({ ticket })).toStrictEqual({
      status: 401,
      code: 'STREAM_TICKET_INVALID',
    });
    first.socket.close();
  });

  test('an expired ticket is refused', async () => {
    const ticket = harness.issueTicket(SUBJECT_A);
    harness.clock.advance(30_000);
    expect(await harness.attempt({ ticket })).toStrictEqual({
      status: 401,
      code: 'STREAM_TICKET_INVALID',
    });
  });

  test('a ticket whose session ends at that very moment is refused', async () => {
    const ticket = harness.issueTicket(SUBJECT_A, 0);
    expect(await harness.attempt({ ticket })).toStrictEqual({
      status: 401,
      code: 'STREAM_TICKET_INVALID',
    });
  });

  test('while LISTEN is not confirmed the answer is 503 and the ticket is kept', async () => {
    harness.endpoint.setReady(false);
    const ticket = harness.issueTicket(SUBJECT_A);
    expect(await harness.attempt({ ticket })).toStrictEqual({
      status: 503,
      code: 'STREAM_UNAVAILABLE',
    });
    harness.endpoint.setReady(true);
    const client = harness.connect({ ticket });
    await client.opened;
    client.socket.close();
  });

  test('a blocked account is 403 and a deleted one is 401', async () => {
    harness.setResolution(SUBJECT_A, USER_RESOLUTION_STATUS.BLOCKED);
    expect(await harness.attempt({ ticket: harness.issueTicket(SUBJECT_A) })).toStrictEqual({
      status: 403,
      code: 'ACCOUNT_BLOCKED',
    });
    harness.setResolution(SUBJECT_A, USER_RESOLUTION_STATUS.DELETED);
    expect(await harness.attempt({ ticket: harness.issueTicket(SUBJECT_A) })).toStrictEqual({
      status: 401,
      code: 'ACCOUNT_DELETED',
    });
  });

  test('the upgrade rate limit per address answers 429', async () => {
    let last = 0;
    for (let index = 0; index < 31; index += 1) {
      last = (await harness.attempt({ ticket: 'qualquer' })).status;
    }
    expect(last).toBe(429);
  });
});

describe('GET /v1/stream — per-user socket ceiling', () => {
  test('the sixth socket of one user is refused with 429 while another user connects', async () => {
    const clients = [];
    for (let index = 0; index < 5; index += 1) {
      const client = harness.connect({ ticket: harness.issueTicket(SUBJECT_A) });
      await client.opened;
      clients.push(client);
    }
    expect(await harness.attempt({ ticket: harness.issueTicket(SUBJECT_A) })).toStrictEqual({
      status: 429,
      code: 'STREAM_LIMIT_REACHED',
    });
    const other = harness.connect({ ticket: harness.issueTicket(SUBJECT_B) });
    await other.opened;
    for (const client of [...clients, other]) client.socket.close();
  });

  test('a closed socket frees its slot', async () => {
    const clients = [];
    for (let index = 0; index < 5; index += 1) {
      const client = harness.connect({ ticket: harness.issueTicket(SUBJECT_A) });
      await client.opened;
      clients.push(client);
    }
    clients[0]?.socket.close();
    await waitFor(() => harness.endpoint.hub.countForUser(USER_A) === 4, 'vaga liberada');
    const again = harness.connect({ ticket: harness.issueTicket(SUBJECT_A) });
    await again.opened;
    for (const client of [...clients, again]) client.socket.close();
  });
});

describe('stream — delivery is by owner', () => {
  test('an event of A reaches the sockets of A and never the socket of B', async () => {
    const ofA = harness.connect({ ticket: harness.issueTicket(SUBJECT_A) });
    const ofB = harness.connect({ ticket: harness.issueTicket(SUBJECT_B) });
    await Promise.all([ofA.opened, ofB.opened]);
    harness.endpoint.hub.sendToUser(USER_A, { type: 'event', runId: RUN_ID });
    await waitFor(() => ofA.messages.length === 1, 'evento de A');
    await Bun.sleep(QUIET_MILLISECONDS);
    expect(ofB.messages).toStrictEqual([]);
    ofA.socket.close();
    ofB.socket.close();
  });

  test('closeUser closes only the sockets of that user, with 4403', async () => {
    const ofA = harness.connect({ ticket: harness.issueTicket(SUBJECT_A) });
    const ofB = harness.connect({ ticket: harness.issueTicket(SUBJECT_B) });
    await Promise.all([ofA.opened, ofB.opened]);
    harness.endpoint.closeUser(USER_A);
    expect((await ofA.closed).code).toBe(4403);
    await Bun.sleep(QUIET_MILLISECONDS);
    expect(ofB.socket.readyState).toBe(WebSocket.OPEN);
    ofB.socket.close();
  });

  test('a lost listener makes every socket resync, and so does the restored one', async () => {
    const ofA = harness.connect({ ticket: harness.issueTicket(SUBJECT_A) });
    const ofB = harness.connect({ ticket: harness.issueTicket(SUBJECT_B) });
    await Promise.all([ofA.opened, ofB.opened]);
    harness.endpoint.handleListenerLost();
    await waitFor(() => ofA.messages.length === 1 && ofB.messages.length === 1, 'resync na perda');
    expect(ofA.messages[0]).toStrictEqual({ type: 'resync', reason: 'listener_lost' });
    expect(harness.endpoint.isReady()).toBe(false);
    harness.endpoint.handleListenerListening(true);
    await waitFor(() => ofA.messages.length === 2, 'resync na volta');
    expect(ofA.messages[1]).toStrictEqual({ type: 'resync', reason: 'listener_restored' });
    expect(harness.endpoint.isReady()).toBe(true);
    ofA.socket.close();
    ofB.socket.close();
  });

  test('the first LISTEN does not send a resync (nothing was lost yet)', async () => {
    const ofA = harness.connect({ ticket: harness.issueTicket(SUBJECT_A) });
    await ofA.opened;
    harness.endpoint.handleListenerListening(false);
    await Bun.sleep(QUIET_MILLISECONDS);
    expect(ofA.messages).toStrictEqual([]);
    ofA.socket.close();
  });
});

describe('stream — token expiry and renewal inside the socket', () => {
  test('without renewal the socket closes with 4401 when the token expires', async () => {
    const client = harness.connect({ ticket: harness.issueTicket(SUBJECT_A) });
    await client.opened;
    harness.clock.advance(SESSION_LIFETIME_MILLISECONDS);
    harness.endpoint.sweep();
    expect((await client.closed).code).toBe(4401);
  });

  test('a renewal with a fresh ticket of the same user keeps the socket past the old expiry', async () => {
    const client = harness.connect({ ticket: harness.issueTicket(SUBJECT_A) });
    await client.opened;
    await ageWithHeartbeat(SESSION_LIFETIME_MILLISECONDS - 60_000);
    client.send(JSON.stringify({ type: 'renew', ticket: harness.issueTicket(SUBJECT_A) }));
    await waitFor(() => client.messages.length === 1, 'resposta da renovação');
    expect(client.messages[0]).toMatchObject({ type: 'renewed' });
    // O vencimento antigo já passou: só a renovação mantém o socket de pé.
    await ageWithHeartbeat(SESSION_LIFETIME_MILLISECONDS - 120_000);
    expect(client.socket.readyState).toBe(WebSocket.OPEN);
    await ageWithHeartbeat(SESSION_LIFETIME_MILLISECONDS);
    expect((await client.closed).code).toBe(4401);
  });

  test('a renewal with the ticket of ANOTHER user closes the socket with 4401', async () => {
    const client = harness.connect({ ticket: harness.issueTicket(SUBJECT_A) });
    await client.opened;
    client.send(JSON.stringify({ type: 'renew', ticket: harness.issueTicket(SUBJECT_B) }));
    expect((await client.closed).code).toBe(4401);
  });

  test('a renewal with an unknown or reused ticket closes the socket with 4401', async () => {
    const client = harness.connect({ ticket: harness.issueTicket(SUBJECT_A) });
    await client.opened;
    client.send(JSON.stringify({ type: 'renew', ticket: 'ticket-que-nao-existe' }));
    expect((await client.closed).code).toBe(4401);
  });

  test('a renewal with a ticket whose session ends at that very moment closes the socket with 4401', async () => {
    const client = harness.connect({ ticket: harness.issueTicket(SUBJECT_A) });
    await client.opened;
    client.send(JSON.stringify({ type: 'renew', ticket: harness.issueTicket(SUBJECT_A, 0) }));
    expect((await client.closed).code).toBe(4401);
  });

  test('a renewal for an account blocked meanwhile closes the socket with 4403', async () => {
    const client = harness.connect({ ticket: harness.issueTicket(SUBJECT_A) });
    await client.opened;
    const renewal = harness.issueTicket(SUBJECT_A);
    harness.setResolution(SUBJECT_A, USER_RESOLUTION_STATUS.BLOCKED);
    client.send(JSON.stringify({ type: 'renew', ticket: renewal }));
    expect((await client.closed).code).toBe(4403);
  });
});

describe('stream — hostile clients', () => {
  test('a message above the size ceiling ends the connection (the Bun runtime drops it with 1006)', async () => {
    const client = harness.connect({ ticket: harness.issueTicket(SUBJECT_A) });
    await client.opened;
    client.send('x'.repeat(10_000));
    expect([1006, 1009]).toContain((await client.closed).code);
    await waitFor(() => harness.endpoint.hub.size() === 0, 'socket removido do hub');
  });

  test('text that is not a known message gets a typed error and the socket stays open', async () => {
    const client = harness.connect({ ticket: harness.issueTicket(SUBJECT_A) });
    await client.opened;
    client.send('isto não é json');
    client.send(JSON.stringify({ type: 'desconhecida' }));
    client.send(JSON.stringify({ type: 'renew' }));
    await waitFor(() => client.messages.length === 3, 'três erros');
    expect(client.messages).toStrictEqual([
      { type: 'error', code: 'INVALID_MESSAGE' },
      { type: 'error', code: 'INVALID_MESSAGE' },
      { type: 'error', code: 'INVALID_MESSAGE' },
    ]);
    expect(client.socket.readyState).toBe(WebSocket.OPEN);
    client.socket.close();
  });

  test('a message with extra fields is not a message', async () => {
    const client = harness.connect({ ticket: harness.issueTicket(SUBJECT_A) });
    await client.opened;
    client.send(JSON.stringify({ type: 'renew', ticket: 'x', userId: 'outro' }));
    await waitFor(() => client.messages.length === 1, 'erro');
    expect(client.messages[0]).toStrictEqual({ type: 'error', code: 'INVALID_MESSAGE' });
    client.socket.close();
  });

  test('the message budget renews every minute', async () => {
    const flooded = await createStreamHarness({ maxMessagesPerMinute: 5 });
    try {
      const client = flooded.connect({ ticket: flooded.issueTicket(SUBJECT_A) });
      await client.opened;
      for (let index = 0; index < 5; index += 1) client.send('{}');
      await waitFor(() => client.messages.length === 5, 'cinco erros');
      flooded.clock.advance(60_000);
      for (let index = 0; index < 5; index += 1) client.send('{}');
      await waitFor(() => client.messages.length === 10, 'mais cinco erros');
      expect(client.socket.readyState).toBe(WebSocket.OPEN);
      client.socket.close();
    } finally {
      await flooded.stop();
    }
  });

  test('more than the allowed messages per minute closes the socket with 1008', async () => {
    const flooded = await createStreamHarness({ maxMessagesPerMinute: 5 });
    try {
      const client = flooded.connect({ ticket: flooded.issueTicket(SUBJECT_A) });
      await client.opened;
      for (let index = 0; index < 8; index += 1) client.send('{}');
      expect((await client.closed).code).toBe(1008);
    } finally {
      await flooded.stop();
    }
  });
});

describe('stream — shutdown and logs', () => {
  test('closeAll ends every socket with 1001', async () => {
    const ofA = harness.connect({ ticket: harness.issueTicket(SUBJECT_A) });
    const ofB = harness.connect({ ticket: harness.issueTicket(SUBJECT_B) });
    await Promise.all([ofA.opened, ofB.opened]);
    harness.endpoint.closeAll();
    await Promise.all([ofA.closed, ofB.closed]);
    expect(harness.serverCloseCodes).toStrictEqual([1001, 1001]);
  });

  test('neither the ticket nor the Origin nor the user ever reach the log', async () => {
    const ticket = harness.issueTicket(SUBJECT_A);
    const client = harness.connect({ ticket });
    await client.opened;
    await harness.attempt({ ticket: 'ticket-recusado', origin: FOREIGN_ORIGIN });
    client.socket.close();
    const log = harness.logLines.join('\n');
    expect(log.length).toBeGreaterThan(0);
    for (const secret of [
      ticket,
      'ticket-recusado',
      FOREIGN_ORIGIN,
      ALLOWED_ORIGIN,
      SUBJECT_A,
      USER_A,
      USER_B,
    ]) {
      expect(log).not.toContain(secret);
    }
  });
});
