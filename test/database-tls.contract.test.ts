// Copyright (c) 2026 Ada Technology. All rights reserved.
import { afterAll, beforeAll, describe, expect, setDefaultTimeout, test } from 'bun:test';

import { closeDatabase, openDatabase, pingDatabase } from '../packages/database/src/index.js';
import type { NotificationListener } from '../packages/database/src/notifications/notification-listener.js';
import type { SessionEnd } from '../packages/database/src/notifications/session-end.js';
import {
  startTlsPostgresProxy,
  type TlsPostgresProxy,
} from './fixtures/tls/tls-postgres-proxy.fixture.js';
import { loadDatabaseListenerApi } from './fixtures/postgres-wire/database-source.fixture.js';
import { createTestPki, type TestPki } from './fixtures/tls/test-pki.fixture.js';

// O escutador vem da fonte que o teste de mutantes aponta (a cópia mutada), como nos demais contratos dele.
const { listener: listenerModule } = await loadDatabaseListenerApi();
const { createNotificationListener } = listenerModule;

setDefaultTimeout(20_000);

const VERIFY_FULL = '?sslmode=verify-full';
const SETTLE_MILLISECONDS = 250;

let pki: TestPki;
const proxies: TlsPostgresProxy[] = [];

beforeAll(async () => {
  pki = await createTestPki();
});

afterAll(async () => {
  for (const proxy of proxies) await proxy.stop();
  await pki.dispose();
});

async function proxyFor(certificate: 'forHost' | 'forOtherHost'): Promise<TlsPostgresProxy> {
  const proxy = await startTlsPostgresProxy(pki[certificate]);
  proxies.push(proxy);
  return proxy;
}

function urlOf(proxy: TlsPostgresProxy): string {
  return `postgres://app:segredo@127.0.0.1:${proxy.port}/crypto${VERIFY_FULL}`;
}

async function connectWithBunSql(proxy: TlsPostgresProxy, root: string | undefined): Promise<void> {
  const handle =
    root === undefined
      ? openDatabase(urlOf(proxy))
      : openDatabase(urlOf(proxy), { sslRootCertificate: root });
  await pingDatabase(handle);
  await Bun.sleep(SETTLE_MILLISECONDS);
  await closeDatabase(handle);
}

async function connectWithListener(
  proxy: TlsPostgresProxy,
  root: string | undefined,
): Promise<readonly SessionEnd[]> {
  const lost: SessionEnd[] = [];
  const listener: NotificationListener = createNotificationListener({
    databaseUrl: urlOf(proxy),
    channel: 'test_channel',
    onNotification: () => undefined,
    onListening: () => undefined,
    onLost: (end) => void lost.push(end),
    ...(root === undefined ? {} : { tlsRootCertificate: root }),
    reconnectBaseMilliseconds: 60_000,
    reconnectMaxMilliseconds: 60_000,
  });
  const deadline = performance.now() + 5_000;
  while (lost.length === 0 && !proxy.events.includes('startup') && performance.now() < deadline) {
    await Bun.sleep(20);
  }
  await listener.close();
  return lost;
}

describe('Bun.SQL com a CA própria do banco (DATABASE_SSL_ROOT_CERT)', () => {
  test('sslmode=verify-full sem a CA recusa o certificado: o servidor nunca recebe o startup', async () => {
    const proxy = await proxyFor('forHost');
    await connectWithBunSql(proxy, undefined);
    expect(proxy.events).not.toContain('startup');
  });

  test('com a CA que assinou o certificado, o TLS é aceito e o startup chega cifrado', async () => {
    const proxy = await proxyFor('forHost');
    await connectWithBunSql(proxy, pki.trustedCaPem);
    expect(proxy.events).toContain('startup');
  });

  test('com a CA certa mas o certificado de OUTRO nome, o nome do servidor é recusado', async () => {
    const proxy = await proxyFor('forOtherHost');
    await connectWithBunSql(proxy, pki.trustedCaPem);
    expect(proxy.events).not.toContain('startup');
  });

  test('com uma CA que não assinou o certificado, é recusado', async () => {
    const proxy = await proxyFor('forHost');
    await connectWithBunSql(proxy, pki.untrustedCaPem);
    expect(proxy.events).not.toContain('startup');
  });
});

describe('o escutador de NOTIFY com a CA própria do banco', () => {
  test('sem a CA: TLS falha e o startup nunca sai', async () => {
    const proxy = await proxyFor('forHost');
    const lost = await connectWithListener(proxy, undefined);
    expect(lost[0]?.reason).toBe('tls_failed');
    expect(proxy.events).not.toContain('startup');
  });

  test('com a CA que assinou o certificado: o startup chega cifrado', async () => {
    const proxy = await proxyFor('forHost');
    await connectWithListener(proxy, pki.trustedCaPem);
    expect(proxy.events).toContain('startup');
  });

  test('com a CA certa mas o certificado de outro nome: recusado como tls_failed', async () => {
    const proxy = await proxyFor('forOtherHost');
    const lost = await connectWithListener(proxy, pki.trustedCaPem);
    expect(lost[0]?.reason).toBe('tls_failed');
    expect(proxy.events).not.toContain('startup');
  });

  test('com outra CA: recusado como tls_failed', async () => {
    const proxy = await proxyFor('forHost');
    const lost = await connectWithListener(proxy, pki.untrustedCaPem);
    expect(lost[0]?.reason).toBe('tls_failed');
    expect(proxy.events).not.toContain('startup');
  });
});
