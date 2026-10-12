// Copyright (c) 2026 Ada Technology. All rights reserved.
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';

import { scheduleControlledKill } from './controlled-kill.js';
import { scheduleCron } from './cron-job.js';
import { runCompose } from './docker-compose.js';
import { createInfraWaiter } from './infra-waiter.js';
import { CHILD_NAME, EVENT_TYPE } from './live72.constant.js';
import {
  loadLive72Environment,
  resolveLive72Paths,
  type Live72Paths,
} from './live72-environment.js';
import { appendEvent } from './live72-events.js';
import { openLive72Sql, readRunCounts } from './live72-database.js';
import { REPOSITORY_ROOT } from './live72-paths.js';
import type { RunCounts } from './run-counts.js';
import { reapStaleChildren } from './process-state.js';
import { createRotatingLog } from './rotating-log.js';
import { superviseProcess, type SupervisedProcess } from './supervised-process.js';

const LOG_MAXIMUM_BYTES = 20 * 1024 * 1024;
const LOG_KEPT_FILES = 5;
const SECRET_PREFIX = 'LIVE72_USER_';

const ENTRY_POINTS = {
  [CHILD_NAME.API]: 'apps/api-ativada/src/main.ts',
  [CHILD_NAME.WORKER]: 'apps/worker-ativada/src/main.ts',
  [CHILD_NAME.TELEGRAM_SINK]: 'scripts/live72/telegram-sink.ts',
  [CHILD_NAME.CRON]: 'apps/cron-ativada/src/main.ts',
} as const;

// Os filhos herdam o ambiente da simulação, menos a credencial do usuário de teste.
function buildChildEnvironment(): Record<string, string> {
  const environment: Record<string, string> = {};
  for (const [key, value] of Object.entries(Bun.env)) {
    if (value !== undefined && !key.startsWith(SECRET_PREFIX)) environment[key] = value;
  }
  return environment;
}

function commandFor(name: keyof typeof ENTRY_POINTS): string[] {
  return [process.execPath, 'run', `${REPOSITORY_ROOT}/${ENTRY_POINTS[name]}`];
}

function logFor(paths: Live72Paths, name: string): ReturnType<typeof createRotatingLog> {
  return createRotatingLog({
    path: `${paths.logs}/${name}.log`,
    maximumBytes: LOG_MAXIMUM_BYTES,
    keptFiles: LOG_KEPT_FILES,
  });
}

function startProcesses(params: {
  readonly paths: Live72Paths;
  readonly waitForInfra: () => Promise<void>;
}): SupervisedProcess[] {
  const { paths, waitForInfra } = params;
  const names = [CHILD_NAME.TELEGRAM_SINK, CHILD_NAME.API, CHILD_NAME.WORKER] as const;
  return names.map((name) =>
    superviseProcess({
      name,
      command: commandFor(name),
      cwd: REPOSITORY_ROOT,
      env: buildChildEnvironment(),
      log: logFor(paths, name),
      eventsFile: paths.eventsFile,
      pidFile: `${paths.run}/${name}.pid`,
      waitForInfra,
    }),
  );
}

function prepareRuntime(paths: Live72Paths): void {
  mkdirSync(paths.logs, { recursive: true });
  mkdirSync(paths.run, { recursive: true });
  reapStaleChildren(paths.run);
  writeFileSync(`${paths.run}/supervisor.pid`, `${process.pid}\n`);
  appendEvent(paths.eventsFile, EVENT_TYPE.SUPERVISOR_START, { pid: process.pid });
}

function createCountsReader(databaseUrl: string): (runId: string) => Promise<RunCounts> {
  return async (runId) => {
    const sql = openLive72Sql(databaseUrl);
    try {
      return await readRunCounts(sql, runId);
    } finally {
      await sql.close();
    }
  };
}

function main(): void {
  const environment = loadLive72Environment();
  const paths = resolveLive72Paths(environment);
  prepareRuntime(paths);
  const waitForInfra = createInfraWaiter({
    databaseUrl: environment.DATABASE_URL,
    eventsFile: paths.eventsFile,
    composeUp: async () => void (await runCompose(['up', '-d'])),
  });
  const processes = startProcesses({ paths, waitForInfra });
  const worker = processes.find((entry) => entry.name === CHILD_NAME.WORKER);
  if (worker === undefined) throw new Error('worker não iniciado');
  const cron = scheduleCron({
    command: commandFor(CHILD_NAME.CRON),
    cwd: REPOSITORY_ROOT,
    env: buildChildEnvironment(),
    log: logFor(paths, CHILD_NAME.CRON),
    eventsFile: paths.eventsFile,
    waitForInfra,
  });
  const kill = scheduleControlledKill({
    runFile: paths.runFile,
    eventsFile: paths.eventsFile,
    worker,
    readCounts: createCountsReader(environment.DATABASE_URL),
  });
  registerShutdown({ paths, processes, cron, kill });
}

type ShutdownParams = {
  readonly paths: Live72Paths;
  readonly processes: readonly SupervisedProcess[];
  readonly cron: { readonly stop: () => Promise<void> };
  readonly kill: { readonly stop: () => void };
};

function registerShutdown(params: ShutdownParams): void {
  let isShuttingDown = false;
  const shutdown = (signal: string): void => {
    if (isShuttingDown) return;
    isShuttingDown = true;
    params.kill.stop();
    void Promise.all([params.cron.stop(), ...params.processes.map((entry) => entry.stop())]).then(
      () => {
        appendEvent(params.paths.eventsFile, EVENT_TYPE.SUPERVISOR_STOP, { signal });
        rmSync(`${params.paths.run}/supervisor.pid`, { force: true });
        process.exit(0);
      },
    );
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main();
