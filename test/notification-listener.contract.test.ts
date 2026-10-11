// Copyright (c) 2026 Ada Technology. All rights reserved.
import { afterEach, describe, expect, setDefaultTimeout, test } from 'bun:test';

import type {
  NotificationListener,
  NotificationListenerSettings,
} from '../packages/database/src/notifications/notification-listener.js';
import type { SessionEnd } from '../packages/database/src/notifications/session-end.js';
import {
  createInMemoryPostgres,
  type FakePostgres,
  type FakePostgresOptions,
} from './fixtures/postgres-wire/in-memory-postgres.fixture.js';
import { loadDatabaseListenerApi } from './fixtures/postgres-wire/database-source.fixture.js';
import { OID_ED25519, syntheticCertificate } from './fixtures/tls/synthetic-certificate.fixture.js';
import { waitFor } from './fixtures/wait-for.fixture.js';

const { listener: listenerModule } = await loadDatabaseListenerApi();
const { createNotificationListener } = listenerModule;

// Um mutante que deixa `ready` pendente reprova em 2 s por teste, não em 5 s.
setDefaultTimeout(3_000);

const WITHIN_MILLISECONDS = 700;

// Espera que dura demais falha DENTRO do teste (e não por tempo esgotado do teste, que vira ruído fora dele).
async function settle(promise: Promise<unknown>, description: string): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const expired = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(
      () => reject(new Error(`tempo esgotado: ${description}`)),
      WITHIN_MILLISECONDS,
    );
  });
  try {
    await Promise.race([promise, expired]);
  } finally {
    clearTimeout(timer);
  }
}

function until(condition: () => boolean, description: string): Promise<void> {
  return waitFor(condition, description, WITHIN_MILLISECONDS);
}

const CHANNEL = 'test_channel';
const PASSWORD = 'segredo-de-teste';
const URL_TEMPLATE = 'postgres://app:segredo-de-teste@127.0.0.1:5432/crypto';
const URL_WITHOUT_PASSWORD = 'postgres://app@127.0.0.1:5432/crypto';
const BASE_DELAY = 50;
const MAX_DELAY = 200;

type Opened = {
  readonly listener: NotificationListener;
  readonly notifications: string[];
  readonly listening: { readonly attempt: number; readonly isReconnect: boolean }[];
  readonly lost: SessionEnd[];
  readonly delays: number[];
};

const openedListeners: NotificationListener[] = [];

afterEach(async () => {
  await Promise.all(openedListeners.splice(0).map((listener) => settle(listener.close(), 'close')));
});

function open(
  fake: FakePostgres,
  overrides: Partial<NotificationListenerSettings> & {
    readonly urlSuffix?: string;
    readonly hasPassword?: boolean;
  } = {},
): Opened {
  const notifications: string[] = [];
  const listening: Opened['listening'][number][] = [];
  const lost: SessionEnd[] = [];
  const delays: number[] = [];
  const { urlSuffix, hasPassword = false, ...settingsOverrides } = overrides;
  const listener = createNotificationListener({
    databaseUrl: `${fake.authentication === 'trust' && !hasPassword ? URL_WITHOUT_PASSWORD : URL_TEMPLATE}${urlSuffix ?? ''}`,
    channel: CHANNEL,
    openTransport: fake.openTransport,
    onNotification: (payload) => void notifications.push(payload),
    onListening: (event) => void listening.push(event),
    onLost: (end) => void lost.push(end),
    reconnectBaseMilliseconds: BASE_DELAY,
    reconnectMaxMilliseconds: MAX_DELAY,
    keepAliveMilliseconds: 10_000,
    random: () => 1,
    sleep: (milliseconds) => {
      delays.push(milliseconds);
      return Bun.sleep(1);
    },
    ...settingsOverrides,
  });
  openedListeners.push(listener);
  return { listener, notifications, listening, lost, delays };
}

function fakeWith(options: FakePostgresOptions): FakePostgres {
  return createInMemoryPostgres(options);
}

describe('notification listener — LISTEN confirmed before ready', () => {
  test('ready resolves only after the server acknowledged LISTEN', async () => {
    const fake = fakeWith({ authentication: 'trust' });
    const { listener, listening } = open(fake);
    expect(listener.isListening()).toBe(false);
    await settle(listener.ready, 'ready');
    expect(listener.isListening()).toBe(true);
    expect(listening).toStrictEqual([{ attempt: 1, isReconnect: false }]);
    const [connection] = fake.connections;
    expect(connection?.queries).toStrictEqual([`LISTEN "${CHANNEL}"`]);
    expect(connection?.startupUser).toBe('app');
    expect(connection?.startupDatabase).toBe('crypto');
  });

  test('stays not listening — and ready stays pending — until the server acknowledges LISTEN', async () => {
    const fake = fakeWith({ authentication: 'trust' });
    fake.holdListenAcknowledgement(true);
    const { listener, listening } = open(fake);
    await until(() => fake.connections[0]?.queries.length === 1, 'LISTEN enviado');
    let isReady = false;
    void listener.ready.then(() => {
      isReady = true;
    });
    await Bun.sleep(60);
    expect(listener.isListening()).toBe(false);
    expect(isReady).toBe(false);
    expect(listening).toStrictEqual([]);
    fake.holdListenAcknowledgement(false);
    await settle(listener.ready, 'ready');
    expect(listener.isListening()).toBe(true);
    expect(listening).toHaveLength(1);
  });

  test('delivers payloads of the channel in order', async () => {
    const fake = fakeWith({ authentication: 'trust' });
    const { listener, notifications } = open(fake);
    await settle(listener.ready, 'ready');
    fake.notify('um');
    fake.notify('dois');
    fake.notify('outro canal', 'outro_canal');
    fake.notify('três');
    await until(() => notifications.length === 3, 'três notificações');
    expect(notifications).toStrictEqual(['um', 'dois', 'três']);
  });

  test('a throwing handler does not break the session', async () => {
    const fake = fakeWith({ authentication: 'trust' });
    const received: string[] = [];
    const { listener } = open(fake, {
      onNotification: (payload) => {
        received.push(payload);
        if (payload === 'quebra') throw new Error('falha do consumidor');
      },
    });
    await settle(listener.ready, 'ready');
    fake.notify('quebra');
    fake.notify('depois');
    await until(() => received.length === 2, 'duas notificações');
    expect(listener.isListening()).toBe(true);
  });

  test('rejects a channel name that is not a plain identifier', () => {
    const fake = fakeWith({ authentication: 'trust' });
    expect(() => open(fake, { channel: 'x"; DROP TABLE users; --' })).toThrow();
  });
});

describe('notification listener — authentication', () => {
  test('SCRAM-SHA-256 with the right password reaches LISTEN', async () => {
    const fake = fakeWith({ authentication: 'scram', password: PASSWORD });
    const { listener } = open(fake);
    await settle(listener.ready, 'ready');
    expect(fake.connections[0]?.passwordMessages).toBe(2);
    expect(listener.isListening()).toBe(true);
  });

  test('a wrong password reports authentication_failed with the SQLSTATE and keeps retrying', async () => {
    const fake = fakeWith({ authentication: 'scram', password: 'outra-senha' });
    const { listener, lost } = open(fake);
    await until(() => lost.length >= 2, 'duas falhas de autenticação');
    expect(lost[0]).toStrictEqual({
      reason: 'authentication_failed',
      sqlState: '28P01',
      wasListening: false,
    });
    expect(listener.isListening()).toBe(false);
    fake.setPassword(PASSWORD);
    await settle(listener.ready, 'ready');
    expect(listener.isListening()).toBe(true);
  });

  test('neither the password nor the URL reaches the callbacks', async () => {
    const fake = fakeWith({ authentication: 'scram', password: 'outra-senha' });
    const { lost } = open(fake);
    await until(() => lost.length >= 1, 'uma falha');
    const serialized = JSON.stringify(lost);
    expect(serialized).not.toContain(PASSWORD);
    expect(serialized).not.toContain('postgres://');
  });

  test.each(['md5', 'cleartext'] as const)(
    '%s authentication is refused without ever sending a password',
    async (authentication) => {
      const fake = fakeWith({ authentication, password: PASSWORD });
      const { lost } = open(fake);
      await until(() => lost.length >= 1, 'recusa');
      expect(lost[0]?.reason).toBe('unsupported_authentication');
      expect(fake.connections[0]?.passwordMessages).toBe(0);
    },
  );

  test('a server that answers ok without ever proving itself (no SASLFinal) is refused', async () => {
    const fake = fakeWith({ authentication: 'scram-without-final', password: PASSWORD });
    const { listener, lost } = open(fake);
    await until(() => lost.length >= 1, 'recusa do servidor sem prova');
    expect(lost[0]).toStrictEqual({
      reason: 'authentication_failed',
      sqlState: undefined,
      wasListening: false,
    });
    expect(listener.isListening()).toBe(false);
    expect(fake.connections[0]?.queries).toStrictEqual([]);
  });

  test('a configured password is never trusted to a server that asks for none', async () => {
    const fake = fakeWith({ authentication: 'trust' });
    const { listener, lost } = open(fake, { hasPassword: true });
    await until(() => lost.length >= 1, 'recusa do trust com senha configurada');
    expect(lost[0]?.reason).toBe('authentication_failed');
    expect(listener.isListening()).toBe(false);
    expect(fake.connections[0]?.queries).toStrictEqual([]);
  });

  test('a server error at startup is reported by SQLSTATE only', async () => {
    const fake = fakeWith({ authentication: 'too-many-connections' });
    const { lost } = open(fake);
    await until(() => lost.length >= 1, 'erro do servidor');
    expect(lost[0]).toStrictEqual({
      reason: 'server_error',
      sqlState: '53300',
      wasListening: false,
    });
  });
});

describe('notification listener — fatal reasons', () => {
  test('a wrong password is fatal until a connection finally listens', async () => {
    const fake = fakeWith({ authentication: 'scram', password: 'outra-senha' });
    const { listener, lost } = open(fake);
    expect(listener.fatalReason()).toBeUndefined();
    await until(() => lost.length >= 1, 'falha de autenticação');
    await until(() => listener.fatalReason() === 'authentication_failed', 'motivo fatal');
    fake.setPassword(PASSWORD);
    await settle(listener.ready, 'ready');
    expect(listener.fatalReason()).toBeUndefined();
  });

  test('unsupported authentication and unavailable TLS are fatal too', async () => {
    const md5 = fakeWith({ authentication: 'md5', password: PASSWORD });
    const first = open(md5);
    await until(() => first.listener.fatalReason() === 'unsupported_authentication', 'md5 fatal');
    const plain = fakeWith({ authentication: 'trust', tls: 'unsupported' });
    const second = open(plain, { urlSuffix: '?sslmode=require' });
    await until(
      () => second.listener.fatalReason() === 'tls_unavailable',
      'TLS indisponível fatal',
    );
  });

  test('a refused connection or a dropped one is transient, never fatal', async () => {
    const fake = fakeWith({ authentication: 'trust' });
    fake.setRefusing(true);
    const { listener, lost } = open(fake);
    await until(() => lost.length >= 2, 'duas recusas');
    expect(listener.fatalReason()).toBeUndefined();
    fake.setRefusing(false);
    await settle(listener.ready, 'ready');
    fake.dropConnections();
    await until(() => lost.length >= 3, 'queda');
    expect(listener.fatalReason()).toBeUndefined();
  });

  test('a fatal reason retries at the ceiling at once, instead of hammering the server', async () => {
    const fake = fakeWith({ authentication: 'scram', password: 'outra-senha' });
    const { delays } = open(fake);
    await until(() => delays.length >= 3, 'três esperas');
    expect(delays.slice(0, 3)).toStrictEqual([MAX_DELAY, MAX_DELAY, MAX_DELAY]);
  });
});

describe('notification listener — loss, reconnection and re-LISTEN', () => {
  test('a dropped connection is reported, reconnected and subscribed again', async () => {
    const fake = fakeWith({ authentication: 'trust' });
    const { listener, listening, lost, notifications } = open(fake);
    await settle(listener.ready, 'ready');
    fake.dropConnections();
    await until(() => listening.length === 2, 'segundo LISTEN');
    expect(lost).toStrictEqual([
      { reason: 'closed_by_server', sqlState: undefined, wasListening: true },
    ]);
    expect(listening[1]).toStrictEqual({ attempt: 2, isReconnect: true });
    expect(fake.connections.map((record) => record.queries)).toStrictEqual([
      [`LISTEN "${CHANNEL}"`],
      [`LISTEN "${CHANNEL}"`],
    ]);
    fake.notify('depois da volta');
    await until(() => notifications.length === 1, 'notificação depois da volta');
    expect(notifications).toStrictEqual(['depois da volta']);
  });

  test('isListening is false while the connection is down', async () => {
    const fake = fakeWith({ authentication: 'trust' });
    const { listener, lost } = open(fake);
    await settle(listener.ready, 'ready');
    fake.setRefusing(true);
    fake.dropConnections();
    await until(() => lost.length >= 2, 'queda e recusa');
    expect(listener.isListening()).toBe(false);
  });

  test('refused connections back off exponentially with the configured jitter and ceiling', async () => {
    const fake = fakeWith({ authentication: 'trust' });
    fake.setRefusing(true);
    const { listener, delays, lost } = open(fake);
    await until(() => delays.length >= 5, 'cinco esperas');
    expect(delays.slice(0, 5)).toStrictEqual([50, 100, 200, 200, 200]);
    expect(lost.every((end) => end.reason === 'connection_failed' && !end.wasListening)).toBe(true);
    fake.setRefusing(false);
    await settle(listener.ready, 'ready');
  });

  test('the backoff restarts after a successful LISTEN', async () => {
    const fake = fakeWith({ authentication: 'trust' });
    fake.setRefusing(true);
    const { listener, delays } = open(fake);
    await until(() => delays.length >= 3, 'três esperas');
    fake.setRefusing(false);
    await settle(listener.ready, 'ready');
    const before = delays.length;
    fake.dropConnections();
    await until(() => delays.length > before, 'espera depois da queda');
    expect(delays[before]).toBe(BASE_DELAY);
  });

  test('a silent server is detected by the keep-alive and the connection is replaced', async () => {
    const fake = fakeWith({ authentication: 'trust' });
    const { listener, lost, listening } = open(fake, { keepAliveMilliseconds: 20 });
    await settle(listener.ready, 'ready');
    fake.setSilent(true);
    await until(() => lost.length >= 1, 'silêncio detectado');
    expect(lost[0]).toMatchObject({ reason: 'unresponsive', wasListening: true });
    fake.setSilent(false);
    await until(() => listening.length >= 2, 'nova conexão');
    expect(listener.isListening()).toBe(true);
  });

  test('a healthy connection answers the keep-alive and is not replaced', async () => {
    const fake = fakeWith({ authentication: 'trust' });
    const { listener, lost } = open(fake, { keepAliveMilliseconds: 15 });
    await settle(listener.ready, 'ready');
    await Bun.sleep(120);
    expect(lost).toStrictEqual([]);
    expect(fake.connections).toHaveLength(1);
    expect(fake.connections[0]?.queries.filter((query) => query === '').length).toBeGreaterThan(1);
  });

  test('an absurd frame from the server is a protocol error, not memory growth', async () => {
    const fake = fakeWith({ authentication: 'trust' });
    const { listener, lost } = open(fake);
    await settle(listener.ready, 'ready');
    fake.sendRaw(Uint8Array.from([65, 0x7f, 0xff, 0xff, 0xff]));
    await until(() => lost.length >= 1, 'erro de protocolo');
    expect(lost[0]).toMatchObject({ reason: 'protocol_error', wasListening: true });
  });
});

describe('notification listener — TLS negotiation', () => {
  test('sslmode=disable never asks for TLS', async () => {
    const fake = fakeWith({ authentication: 'trust', tls: 'supported' });
    const { listener } = open(fake, { urlSuffix: '?sslmode=disable' });
    await settle(listener.ready, 'ready');
    expect(fake.connections[0]?.sslRequests).toBe(0);
    expect(fake.connections[0]?.tlsUpgrades).toStrictEqual([]);
  });

  test('sslmode=require without server support never falls back to plaintext', async () => {
    const fake = fakeWith({ authentication: 'trust', tls: 'unsupported' });
    const { lost } = open(fake, { urlSuffix: '?sslmode=require' });
    await until(() => lost.length >= 1, 'TLS indisponível');
    expect(lost[0]?.reason).toBe('tls_unavailable');
    expect(fake.connections[0]?.sslRequests).toBe(1);
    expect(fake.connections[0]?.startupMessages).toBe(0);
  });

  test('sslmode=require upgrades without verifying the certificate', async () => {
    const fake = fakeWith({ authentication: 'trust', tls: 'supported' });
    const { listener } = open(fake, { urlSuffix: '?sslmode=require' });
    await settle(listener.ready, 'ready');
    expect(fake.connections[0]?.tlsUpgrades).toStrictEqual([
      { shouldVerify: false, serverName: '127.0.0.1' },
    ]);
    expect(fake.connections[0]?.startupMessages).toBe(1);
  });

  test('sslmode=verify-full verifies the certificate against the host', async () => {
    const fake = fakeWith({ authentication: 'trust', tls: 'supported' });
    const { listener } = open(fake, { urlSuffix: '?sslmode=verify-full' });
    await settle(listener.ready, 'ready');
    expect(fake.connections[0]?.tlsUpgrades).toStrictEqual([
      { shouldVerify: true, serverName: '127.0.0.1' },
    ]);
  });

  test('a failed TLS handshake is reported and the startup is never sent in plaintext', async () => {
    const fake = fakeWith({ authentication: 'trust', tls: 'handshake-fails' });
    const { lost } = open(fake, { urlSuffix: '?sslmode=require' });
    await until(() => lost.length >= 1, 'handshake falho');
    expect(lost[0]?.reason).toBe('tls_failed');
    expect(fake.connections[0]?.startupMessages).toBe(0);
  });

  test('sslmode=prefer upgrades when the server supports TLS and continues in plaintext when not', async () => {
    const supported = fakeWith({ authentication: 'trust', tls: 'supported' });
    await settle(open(supported).listener.ready, 'ready');
    expect(supported.connections[0]?.tlsUpgrades).toHaveLength(1);
    const unsupported = fakeWith({ authentication: 'trust', tls: 'unsupported' });
    await settle(open(unsupported).listener.ready, 'ready');
    expect(unsupported.connections[0]?.sslRequests).toBe(1);
    expect(unsupported.connections[0]?.startupMessages).toBe(1);
  });
});

describe('notification listener — close', () => {
  test('close terminates the session politely and stops reconnecting', async () => {
    const fake = fakeWith({ authentication: 'trust' });
    const { listener, lost } = open(fake);
    await settle(listener.ready, 'ready');
    await settle(listener.close(), 'close');
    expect(fake.connections[0]?.isTerminated).toBe(true);
    expect(listener.isListening()).toBe(false);
    await Bun.sleep(150);
    expect(fake.connections).toHaveLength(1);
    expect(lost).toStrictEqual([]);
  });

  test('close before the first LISTEN releases ready and opens nothing more', async () => {
    const fake = fakeWith({ authentication: 'trust' });
    fake.setRefusing(true);
    const { listener } = open(fake);
    await settle(listener.close(), 'close');
    await settle(listener.ready, 'ready');
    fake.setRefusing(false);
    await Bun.sleep(150);
    expect(fake.connections).toHaveLength(0);
    expect(listener.isListening()).toBe(false);
  });
});

describe('notification listener — ligação ao canal TLS (SCRAM-SHA-256-PLUS)', () => {
  const FULL = '?sslmode=verify-full';

  test('com TLS e o servidor oferecendo -PLUS, o cliente usa -PLUS com tls-server-end-point e autentica', async () => {
    const fake = fakeWith({
      authentication: 'scram',
      password: PASSWORD,
      tls: 'supported',
      scramPlus: 'offered',
    });
    const { listener } = open(fake, { urlSuffix: FULL, hasPassword: true });
    await settle(listener.ready, 'ready');
    expect(fake.connections[0]?.saslMechanism).toBe('SCRAM-SHA-256-PLUS');
    expect(fake.connections[0]?.gs2Header).toBe('p=tls-server-end-point,,');
  });

  test('com TLS mas sem -PLUS no servidor, o cabeçalho é y,, (e o servidor que não suporta aceita)', async () => {
    const fake = fakeWith({
      authentication: 'scram',
      password: PASSWORD,
      tls: 'supported',
      scramPlus: 'not-offered',
    });
    const { listener } = open(fake, { urlSuffix: FULL, hasPassword: true });
    await settle(listener.ready, 'ready');
    expect(fake.connections[0]?.saslMechanism).toBe('SCRAM-SHA-256');
    expect(fake.connections[0]?.gs2Header).toBe('y,,');
  });

  test('rebaixamento: servidor que SUPORTA -PLUS mas não o anuncia recusa o y,, e a autenticação falha', async () => {
    const fake = fakeWith({
      authentication: 'scram',
      password: PASSWORD,
      tls: 'supported',
      scramPlus: 'hidden',
    });
    const { lost } = open(fake, { urlSuffix: FULL, hasPassword: true });
    await until(() => lost.length >= 1, 'rebaixamento detectado');
    expect(lost[0]).toMatchObject({ reason: 'authentication_failed' });
  });

  test('sem TLS (sslmode=disable) não há ligação ao canal: cabeçalho n,,', async () => {
    const fake = fakeWith({
      authentication: 'scram',
      password: PASSWORD,
      tls: 'supported',
      scramPlus: 'offered',
    });
    const { listener } = open(fake, { urlSuffix: '?sslmode=disable', hasPassword: true });
    await settle(listener.ready, 'ready');
    expect(fake.connections[0]?.saslMechanism).toBe('SCRAM-SHA-256');
    expect(fake.connections[0]?.gs2Header).toBe('n,,');
  });

  test('intermediário no canal: o certificado que o cliente vê não é o do servidor e a prova não fecha', async () => {
    const fake = fakeWith({
      authentication: 'scram',
      password: PASSWORD,
      tls: 'supported',
      scramPlus: 'offered',
      presentedCertificate: syntheticCertificate('2a864886f70d01010b', 2),
    });
    const { lost } = open(fake, { urlSuffix: FULL, hasPassword: true });
    await until(() => lost.length >= 1, 'ligação ao canal recusada');
    expect(lost[0]).toMatchObject({ reason: 'authentication_failed' });
    expect(fake.connections[0]?.gs2Header).toBe('p=tls-server-end-point,,');
  });

  test('certificado com assinatura que não sabemos mapear: sem hash, usa o mecanismo comum com n,,', async () => {
    const fake = fakeWith({
      authentication: 'scram',
      password: PASSWORD,
      tls: 'supported',
      scramPlus: 'offered',
      serverCertificate: syntheticCertificate(OID_ED25519),
    });
    const { listener } = open(fake, { urlSuffix: FULL, hasPassword: true });
    await settle(listener.ready, 'ready');
    expect(fake.connections[0]?.saslMechanism).toBe('SCRAM-SHA-256');
    expect(fake.connections[0]?.gs2Header).toBe('n,,');
  });
});
