// Copyright (c) 2026 Ada Technology. All rights reserved.
import {
  closeDatabase,
  openDatabase,
  resolveUserBySubject,
  USER_RESOLUTION_STATUS,
} from '../packages/database/src/index.js';
import { MIGRATIONS_FOLDER } from '../packages/database/src/database.constant.js';
import { applyMigrations } from '../packages/database/src/migrate.js';
import { readDatabaseUrl } from '../packages/database/src/read-database-url.js';
import {
  createTemporaryDatabase,
  dropTemporaryDatabase,
} from '../packages/database/test-support/temporary-database.js';
import { createActor } from './admin-test/setup-actors.js';
import { startFakeTelegramServer, TEST_CHAT_ID } from './admin-test/check-telegram.js';
import { checkDiscovery, waitForRealm } from './identity-test/check-discovery.js';
import { createCleanupStack, runCleanupReporting } from './identity-test/cleanup-stack.js';
import type { IdentityContext } from './identity-test/identity-context.js';
import { readIdentityEnvironment } from './identity-test/identity-environment.js';
import { assertCondition } from './identity-test/identity-test.error.js';
import { TEST_USER_PASSWORD } from './identity-test/test-users.js';
import {
  E2E_ENV,
  FINAL_BENCHMARK,
  TEMPORARY_DATABASE_PREFIX,
} from './panel-e2e/panel-e2e.constant.js';
import { startControlServer } from './panel-e2e/control-server.js';
import { runPlaywright } from './panel-e2e/run-playwright.js';
import { seedPanelData } from './panel-e2e/seed-panel-data.js';
import { startPanel } from './panel-e2e/start-panel.js';
import { startFakeBinanceStreamServer } from '../packages/market-data-crypto/test-support/fake-binance-stream-server.js';
import { startApi } from './session-test/start-api.js';

const HOLD_POLL_MILLISECONDS = 1000;

const EXPECTED_DISPLAY = {
  equity: '10.420,00',
  initial: '10.000,00',
  resultChange: '+4,20%',
  benchmarkChange: '+1,00%',
  firstSignal: 'Compra 3/4',
  secondSignal: 'Venda 3/4',
  bitcoinPrice: '61.290,00',
  bitcoinChange: '+0,39%',
} as const;

type SqlRow = { readonly deleted: boolean };

async function readDeletionMark(sql: Bun.SQL): Promise<boolean> {
  const rows: unknown = await sql`SELECT (deleted_at IS NOT NULL) AS deleted FROM users`;
  return (rows as readonly SqlRow[]).some((row) => row.deleted);
}

type HoldParams = {
  readonly keepFile: string;
  readonly baseUrl: string;
  readonly apiUrl: string;
  readonly username: string;
  readonly password: string;
  readonly controlUrl: string;
};

// Modo opcional de revisão visual: mantém a pilha de pé até o arquivo de aviso ser apagado.
async function holdForReview(params: HoldParams): Promise<void> {
  const { keepFile, ...info } = params;
  await Bun.write(keepFile, JSON.stringify(info));
  while (await Bun.file(keepFile).exists()) await Bun.sleep(HOLD_POLL_MILLISECONDS);
}

async function main(): Promise<void> {
  const identity: IdentityContext = {
    environment: readIdentityEnvironment(),
    cleanup: createCleanupStack(),
  };
  const adminUrl = readDatabaseUrl();
  let cleanupFailures: readonly string[];
  try {
    const temporary = await createTemporaryDatabase(adminUrl, TEMPORARY_DATABASE_PREFIX);
    identity.cleanup.register('apagar o banco temporário', () =>
      dropTemporaryDatabase(adminUrl, temporary.databaseName),
    );
    await applyMigrations({ databaseUrl: temporary.url, migrationsFolder: MIGRATIONS_FOLDER });
    Bun.env['DATABASE_URL'] = temporary.url;
    await waitForRealm(identity.environment);
    await checkDiscovery(identity);
    const telegram = startFakeTelegramServer(Bun.env['TELEGRAM_API_BASE_URL'] ?? '');
    identity.cleanup.register('parar o Telegram falso', () => telegram.stop());
    const binance = startFakeBinanceStreamServer();
    identity.cleanup.register('parar a Binance falsa', () => binance.stop());
    Bun.env['TICKER_STREAM_ENABLED'] = 'true';
    Bun.env['BINANCE_BASE_URL'] = binance.restUrl;
    Bun.env['BINANCE_STREAM_URL'] = binance.streamUrl;
    const api = startApi();
    identity.cleanup.register('parar a API', () => api.stop());
    const sql = new Bun.SQL(temporary.url);
    identity.cleanup.register('fechar a conexão de teste', () => sql.close());
    const handle = openDatabase(temporary.url);
    identity.cleanup.register('fechar o banco do seed', () => closeDatabase(handle));

    const actor = await createActor({ identity, api, sql }, 'user', undefined);
    const resolution = await resolveUserBySubject(handle, actor.keycloakId);
    assertCondition(resolution.status === USER_RESOLUTION_STATUS.ACTIVE, 'usuário do seed inativo');
    const seeded = await seedPanelData({ handle, scope: resolution.scope });
    const control = startControlServer({
      handle,
      sql,
      scope: resolution.scope,
      runId: seeded.runId,
      lastOpenTime: seeded.lastOpenTime,
      binance,
    });
    identity.cleanup.register('parar o servidor de controle', () => control.stop());

    const baseUrl = identity.environment.panelOrigin;
    const panel = await startPanel(baseUrl);
    identity.cleanup.register('parar o painel', () => panel.stop());
    const keepFile = Bun.env['PANEL_E2E_KEEP_FILE'];
    if (keepFile !== undefined) {
      await holdForReview({
        keepFile,
        baseUrl,
        apiUrl: api.baseUrl,
        username: actor.username,
        password: TEST_USER_PASSWORD,
        controlUrl: control.url,
      });
      return;
    }
    const exitCode = await runPlaywright({
      [E2E_ENV.BASE_URL]: baseUrl,
      [E2E_ENV.API_URL]: api.baseUrl,
      [E2E_ENV.USERNAME]: actor.username,
      [E2E_ENV.PASSWORD]: TEST_USER_PASSWORD,
      [E2E_ENV.EMAIL]: actor.email,
      [E2E_ENV.TELEGRAM_SECRET]: api.environment.TELEGRAM_WEBHOOK_SECRET ?? '',
      [E2E_ENV.TELEGRAM_CHAT_ID]: TEST_CHAT_ID,
      [E2E_ENV.CONTROL_URL]: control.url,
      [E2E_ENV.EXPECTED]: JSON.stringify({ ...EXPECTED_DISPLAY, benchmark: FINAL_BENCHMARK }),
    });
    assertCondition(exitCode === 0, `Playwright terminou com código ${exitCode}`);
    assertCondition(
      await readDeletionMark(sql),
      'a conta apagada pelo painel não foi marcada no banco',
    );
    const log = api.logLines.join('');
    assertCondition(!log.includes(actor.email), 'o e-mail do usuário apareceu no log da API');
  } finally {
    cleanupFailures = await runCleanupReporting(identity.cleanup);
  }
  assertCondition(cleanupFailures.length === 0, `limpeza falhou: ${cleanupFailures.join('; ')}`);
  console.log('panel-e2e: OK');
}

try {
  await main();
} catch (error: unknown) {
  console.error(`panel-e2e: FALHOU - ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
