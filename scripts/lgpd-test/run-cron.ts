// Copyright (c) 2026 Ada Technology. All rights reserved.
import { createPurgeDeletedAccountsTask } from '../../apps/cron-ativada/src/accounts/purge-deleted-accounts.task.js';
import type { PurgeSummary } from '../../apps/cron-ativada/src/accounts/purge-deleted-accounts.task.js';
import { createCronLogger } from '../../apps/cron-ativada/src/logging/cron-logger.js';
import {
  closeDatabase,
  createAccountPurgeRepository,
  openDatabase,
} from '../../packages/database/src/index.js';
import { createKeycloakIdentityAdmin } from '../../packages/identity-admin/src/index.js';
import { assertCondition } from '../identity-test/identity-test.error.js';
import {
  CRON_APP_NAME,
  CRON_ENTRYPOINT,
  NO_GRACE_PERIOD_MILLISECONDS,
} from './lgpd-test.constant.js';
import type { LgpdContext } from './lgpd-test-context.js';

const REPOSITORY_ROOT: string = new URL('../../', import.meta.url).pathname;
const FINISHED_MESSAGE = 'purge-deleted-accounts finished';

export type CronProcessRun = {
  readonly exitCode: number;
  readonly output: string;
  readonly summary: Readonly<Record<string, unknown>>;
};

function findSummary(output: string): Readonly<Record<string, unknown>> {
  for (const line of output.split('\n').reverse()) {
    if (!line.includes(FINISHED_MESSAGE)) continue;
    return JSON.parse(line) as Record<string, unknown>;
  }
  return {};
}

// O mesmo ponto de entrada de produção: carência de 24 h, variáveis do envs/env.test.
export async function runCronProcess(context: LgpdContext): Promise<CronProcessRun> {
  const child = Bun.spawn([process.execPath, 'run', CRON_ENTRYPOINT], {
    cwd: REPOSITORY_ROOT,
    env: { ...Bun.env, DATABASE_URL: context.databaseUrl },
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const [stdout, stderr] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  const exitCode = await child.exited;
  const output = `${stdout}${stderr}`;
  return { exitCode, output, summary: findSummary(stdout) };
}

// Só o teste zera a carência, pelo parâmetro da tarefa; o main.ts de produção usa 24 h.
export async function runPurgeWithoutGracePeriod(context: LgpdContext): Promise<PurgeSummary> {
  const { environment } = context.api;
  const handle = openDatabase(context.databaseUrl);
  try {
    const task = createPurgeDeletedAccountsTask({
      repository: createAccountPurgeRepository(handle),
      identity: createKeycloakIdentityAdmin({
        adminApiUrl: environment.KEYCLOAK_ADMIN_API_URL,
        tokenUrl: environment.KEYCLOAK_TOKEN_URL,
        clientId: environment.KEYCLOAK_SERVICE_CLIENT_ID,
        clientSecret: environment.KEYCLOAK_SERVICE_CLIENT_SECRET,
        now: () => Date.now(),
      }),
      logger: createCronLogger({ appName: CRON_APP_NAME, write: () => undefined }),
      now: () => Date.now(),
      gracePeriodMilliseconds: NO_GRACE_PERIOD_MILLISECONDS,
    });
    return await task();
  } finally {
    await closeDatabase(handle);
  }
}

export function assertCronSucceeded(run: CronProcessRun): void {
  assertCondition(run.exitCode === 0, `o cron saiu com ${run.exitCode}: ${run.output}`);
}
