// Copyright (c) 2026 Ada Technology. All rights reserved.
import { existsSync, readFileSync, rmSync } from 'node:fs';

import type { CliContext } from './cli-context.js';
import { runCompose } from './docker-compose.js';
import { removeAgent } from './launch-agent.js';
import { HOME_DIRECTORY_NAME, MILLISECONDS_PER_SECOND } from './live72.constant.js';
import { parsePid } from './status-format.js';
import { isOwnedProcess, isProcessAlive, readTrackedPids } from './process-state.js';

const SHUTDOWN_POLLS = 20;

async function waitForExit(pid: number): Promise<void> {
  for (let attempt = 0; attempt < SHUTDOWN_POLLS && isProcessAlive(pid); attempt += 1) {
    await Bun.sleep(MILLISECONDS_PER_SECOND);
  }
}

// Descarrega o agente ANTES de pedir a parada ao supervisor: com KeepAlive ele voltaria sozinho.
export async function runStop(context: CliContext): Promise<string[]> {
  await removeAgent(context.environment.HOME);
  const supervisorFile = `${context.paths.run}/supervisor.pid`;
  const supervisorPid = existsSync(supervisorFile)
    ? parsePid(readFileSync(supervisorFile, 'utf8'))
    : null;
  if (supervisorPid !== null && isOwnedProcess(supervisorPid)) {
    process.kill(supervisorPid, 'SIGTERM');
    await waitForExit(supervisorPid);
  }
  for (const pid of readTrackedPids(context.paths.run)) process.kill(pid, 'SIGKILL');
  const exitCode = await runCompose(['stop']);
  return [
    'LaunchAgent descarregado e processos parados',
    exitCode === 0
      ? 'containers parados (volumes e dados preservados)'
      : 'AVISO: docker compose stop falhou',
  ];
}

function assertSafeToRemove(root: string): void {
  if (!root.endsWith(HOME_DIRECTORY_NAME) && !root.includes('live72')) {
    throw new Error(`recusei apagar ${root}: não parece o diretório da simulação`);
  }
}

export async function runDown(context: CliContext): Promise<string[]> {
  const stopped = await runStop(context);
  const exitCode = await runCompose(['down', '--volumes', '--remove-orphans']);
  assertSafeToRemove(context.paths.root);
  rmSync(context.paths.root, { recursive: true, force: true });
  return [
    ...stopped,
    exitCode === 0 ? 'containers e volumes removidos' : 'AVISO: docker compose down falhou',
    `${context.paths.root} apagado`,
  ];
}
