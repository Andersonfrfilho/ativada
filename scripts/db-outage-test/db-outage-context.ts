// Copyright (c) 2026 Ada Technology. All rights reserved.
import { MIGRATIONS_FOLDER } from '../../packages/database/src/database.constant.js';
import { applyMigrations } from '../../packages/database/src/migrate.js';
import { readDatabaseUrl } from '../../packages/database/src/read-database-url.js';
import {
  OUTAGE_PROXY_MODE,
  startOutageProxy,
  type OutageProxy,
} from '../../packages/database/test-support/outage-proxy.js';
import {
  createTemporaryDatabase,
  dropTemporaryDatabase,
  type TemporaryDatabase,
} from '../../packages/database/test-support/temporary-database.js';
import {
  startFakeBinanceStreamServer,
  type FakeBinanceStreamServer,
} from '../../packages/market-data-crypto/test-support/fake-binance-stream-server.js';
import {
  createApiRunsContext,
  type ApiResponse,
  type ApiRunsContext,
} from '../api-runs-test/api-runs-test-context.js';
import {
  closeLiveTestContext,
  createLiveTestContext,
  type LiveTestContext,
} from '../live-test/live-test-context.js';
import {
  DATABASE_QUERY_TIMEOUT_SECONDS,
  POLL_MILLISECONDS,
  REFERENCE_DATABASE_PREFIX,
  STALL_SWEEP_SECONDS,
  SUBJECT_DATABASE_PREFIX,
  WAIT_TIMEOUT_MILLISECONDS,
  WORKER_HEARTBEAT_SECONDS,
} from './db-outage-test.constant.js';
import { startOutageWorker, type OutageWorker } from './worker-process.js';

const ADMIN_CLAIMS = { realm_access: { roles: ['user', 'admin'] }, acr: '2' } as const;
const ADMIN_SUBJECT = 'subject-outage-admin';
const DEFAULT_POSTGRES_PORT = '5432';

export type OutageSite = {
  readonly adminUrl: string;
  readonly password: string;
  // Banco com a execução contínua (nada o derruba) e banco do cenário (worker e API chegam nele pelo proxy).
  readonly reference: LiveTestContext;
  readonly subject: LiveTestContext;
  readonly proxy: OutageProxy;
  readonly proxiedUrl: string;
  readonly api: ApiRunsContext;
  readonly fake: FakeBinanceStreamServer;
  readonly worker: { current: OutageWorker };
  readonly temporaryDatabases: readonly TemporaryDatabase[];
};

export function reportLine(message: string): void {
  process.stdout.write(`db-outage-test: ${message}\n`);
}

export function assertCondition(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

export async function waitUntil(
  description: string,
  condition: () => boolean | Promise<boolean>,
  timeoutMilliseconds: number = WAIT_TIMEOUT_MILLISECONDS,
): Promise<number> {
  const startedAt = Date.now();
  while (!(await condition())) {
    assertCondition(
      Date.now() - startedAt < timeoutMilliseconds,
      `tempo esgotado esperando: ${description}`,
    );
    await Bun.sleep(POLL_MILLISECONDS);
  }
  return Date.now() - startedAt;
}

function proxiedUrlOf(databaseUrl: string, proxy: OutageProxy): string {
  const url = new URL(databaseUrl);
  url.hostname = proxy.host;
  url.port = String(proxy.port);
  return url.toString();
}

function fakeUrls(fake: FakeBinanceStreamServer): { restUrl: string; streamUrl: string } {
  return { restUrl: fake.restUrl, streamUrl: fake.streamUrl };
}

export async function createOutageSite(): Promise<OutageSite> {
  // Estes valores valem para a API que roda neste processo; o worker recebe os dele em `buildEnvironment`.
  Bun.env['DATABASE_QUERY_TIMEOUT_SECONDS'] = String(DATABASE_QUERY_TIMEOUT_SECONDS);
  Bun.env['WORKER_HEARTBEAT_SECONDS'] = String(WORKER_HEARTBEAT_SECONDS);
  Bun.env['LIVE_STALL_SWEEP_SECONDS'] = String(STALL_SWEEP_SECONDS);
  const adminUrl = readDatabaseUrl();
  const referenceDatabase = await createTemporaryDatabase(adminUrl, REFERENCE_DATABASE_PREFIX);
  const subjectDatabase = await createTemporaryDatabase(adminUrl, SUBJECT_DATABASE_PREFIX);
  for (const database of [referenceDatabase, subjectDatabase]) {
    await applyMigrations({ databaseUrl: database.url, migrationsFolder: MIGRATIONS_FOLDER });
  }
  const target = new URL(adminUrl);
  const proxy = startOutageProxy({
    targetHost: target.hostname,
    targetPort: Number(target.port === '' ? DEFAULT_POSTGRES_PORT : target.port),
  });
  const proxiedUrl = proxiedUrlOf(subjectDatabase.url, proxy);
  const fake = startFakeBinanceStreamServer();
  const api = await createApiRunsContext(proxiedUrl);
  return {
    adminUrl,
    password: decodeURIComponent(target.password),
    reference: await createLiveTestContext(referenceDatabase.url),
    subject: await createLiveTestContext(subjectDatabase.url),
    proxy,
    proxiedUrl,
    api,
    fake,
    worker: { current: startOutageWorker({ databaseUrl: proxiedUrl, ...fakeUrls(fake) }) },
    temporaryDatabases: [referenceDatabase, subjectDatabase],
  };
}

export function restartWorker(site: OutageSite): void {
  site.worker.current = startOutageWorker({ databaseUrl: site.proxiedUrl, ...fakeUrls(site.fake) });
}

export async function closeOutageSite(site: OutageSite): Promise<void> {
  if (!site.worker.current.hasExited()) await site.worker.current.terminate();
  site.proxy.setMode(OUTAGE_PROXY_MODE.FORWARD);
  await site.api.stop();
  site.proxy.stop();
  await site.fake.stop();
  await closeLiveTestContext(site.subject);
  await closeLiveTestContext(site.reference);
  for (const database of site.temporaryDatabases) {
    await dropTemporaryDatabase(site.adminUrl, database.databaseName);
  }
}

export type PublicHealth = { readonly status: number; readonly text: string };

export async function readPublicHealth(site: OutageSite): Promise<PublicHealth> {
  const response = await site.api.call({ path: '/v1/health' });
  return { status: response.status, text: response.text };
}

export function readAdminHealth(site: OutageSite): Promise<ApiResponse> {
  return site.api.call({ subject: ADMIN_SUBJECT, claims: ADMIN_CLAIMS, path: '/v1/admin/health' });
}

export type AdminSnapshot = {
  readonly database: { readonly state: string; readonly lastFailureCode: string | null };
  readonly worker: { readonly state: string };
};

export async function readAdminSnapshot(site: OutageSite): Promise<AdminSnapshot> {
  const response = await readAdminHealth(site);
  assertCondition(response.status === 200, `admin health: ${response.status}`);
  const body = response.json as { readonly data: AdminSnapshot };
  return body.data;
}
