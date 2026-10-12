// Copyright (c) 2026 Ada Technology. All rights reserved.
import { MIGRATIONS_FOLDER } from '../../packages/database/src/database.constant.js';
import { applyMigrations } from '../../packages/database/src/migrate.js';
import type { CliContext } from './cli-context.js';
import { runCompose } from './docker-compose.js';
import { ensureKeycloakUser, linkFakeTelegram, openSession } from './identity-session.js';
import { installAgent } from './launch-agent.js';
import { EVENT_TYPE, MILLISECONDS_PER_SECOND } from './live72.constant.js';
import { readEventsFile } from './live72-events.js';
import { ENV_FILE, REPOSITORY_ROOT, SUPERVISOR_SCRIPT } from './live72-paths.js';
import { isApiHealthy } from './process-state.js';

const API_WAIT_POLLS = 90;
const BACKFILL_WAIT_POLLS = 360;
const POLL_MILLISECONDS = 5 * MILLISECONDS_PER_SECOND;

async function waitUntil(check: () => boolean | Promise<boolean>, polls: number): Promise<boolean> {
  for (let attempt = 0; attempt < polls; attempt += 1) {
    if (await check()) return true;
    await Bun.sleep(POLL_MILLISECONDS);
  }
  return false;
}

function hasSuccessfulCron(eventsFile: string): boolean {
  return readEventsFile(eventsFile).events.some(
    (event) => event.type === EVENT_TYPE.CRON_RUN && event['exitCode'] === 0,
  );
}

async function prepareInfra(context: CliContext): Promise<void> {
  const exitCode = await runCompose(['up', '-d', '--wait']);
  if (exitCode !== 0) throw new Error(`docker compose up falhou (código ${exitCode})`);
  await applyMigrations({
    databaseUrl: context.environment.DATABASE_URL,
    migrationsFolder: MIGRATIONS_FOLDER,
  });
}

async function prepareIdentity(context: CliContext): Promise<string> {
  const outcome = await ensureKeycloakUser(context.identity, context.credentials);
  const session = await openSession({
    identity: context.identity,
    apiBaseUrl: context.apiUrl,
    credentials: context.credentials,
  });
  const isNewLink = !session.isTelegramLinked;
  if (isNewLink) {
    await linkFakeTelegram({
      apiBaseUrl: context.apiUrl,
      accessToken: session.accessToken,
      webhookSecret: context.environment.TELEGRAM_WEBHOOK_SECRET,
    });
  }
  return `usuário de teste ${outcome === 'created' ? 'criado' : 'já existia'}; chat falso do Telegram ${isNewLink ? 'vinculado agora' : 'já vinculado'}`;
}

export async function runUp(context: CliContext): Promise<string[]> {
  await prepareInfra(context);
  await installAgent({
    bunPath: process.execPath,
    envFile: ENV_FILE,
    supervisorScript: SUPERVISOR_SCRIPT,
    workingDirectory: REPOSITORY_ROOT,
    logsDirectory: context.paths.logs,
    home: context.environment.HOME,
  });
  const isApiUp = await waitUntil(() => isApiHealthy(context.apiUrl), API_WAIT_POLLS);
  if (!isApiUp)
    throw new Error('a API não respondeu a tempo; veja os logs em ' + context.paths.logs);
  const identityLine = await prepareIdentity(context);
  const isBackfilled = await waitUntil(
    () => hasSuccessfulCron(context.paths.eventsFile),
    BACKFILL_WAIT_POLLS,
  );
  return [
    'infra: Postgres, Keycloak e Mailpit de pé; migrations aplicadas',
    'LaunchAgent carregado (supervisor com KeepAlive e caffeinate)',
    `identidade: ${identityLine}`,
    isBackfilled
      ? 'backfill de candles e Fear & Greed concluído pelo cron'
      : 'AVISO: o backfill ainda não terminou; acompanhe com make live72-status antes do start',
  ];
}
