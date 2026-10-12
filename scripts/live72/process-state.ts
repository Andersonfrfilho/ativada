// Copyright (c) 2026 Ada Technology. All rights reserved.
import { existsSync, readFileSync } from 'node:fs';

import { CHILD_NAME, HTTP_OK, REQUEST_TIMEOUT_MILLISECONDS } from './live72.constant.js';
import { REPOSITORY_ROOT } from './live72-paths.js';
import { parseDfAvailableKilobytes, parsePid, type ProcessState } from './status-format.js';

const SUPERVISOR_NAME = 'supervisor';
const TRACKED_NAMES = [
  SUPERVISOR_NAME,
  CHILD_NAME.API,
  CHILD_NAME.WORKER,
  CHILD_NAME.TELEGRAM_SINK,
] as const;

export function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

// Pid de arquivo velho pode ter sido reaproveitado pelo sistema: só vale se a linha de comando é desta simulação.
export function isOwnedCommand(commandLine: string, repositoryRoot: string): boolean {
  return commandLine.includes(`${repositoryRoot}/`) && commandLine.includes('bun');
}

export function isOwnedProcess(pid: number): boolean {
  if (!isProcessAlive(pid)) return false;
  const result = Bun.spawnSync(['ps', '-p', String(pid), '-o', 'command='], {
    stdout: 'pipe',
    stderr: 'ignore',
  });
  return isOwnedCommand(result.stdout.toString(), REPOSITORY_ROOT);
}

export function readProcessStates(runDirectory: string): ProcessState[] {
  return TRACKED_NAMES.map((name) => {
    const file = `${runDirectory}/${name}.pid`;
    const pid = existsSync(file) ? parsePid(readFileSync(file, 'utf8')) : null;
    return { name, pid, isAlive: pid !== null && isOwnedProcess(pid) };
  });
}

export function readTrackedPids(runDirectory: string): number[] {
  return readProcessStates(runDirectory).flatMap((entry) =>
    entry.pid !== null && entry.isAlive ? [entry.pid] : [],
  );
}

export async function isApiHealthy(apiUrl: string): Promise<boolean> {
  try {
    const response = await fetch(`${apiUrl}/v1/health`, {
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MILLISECONDS),
    });
    return response.status === HTTP_OK;
  } catch {
    return false;
  }
}

export async function readDiskFreeKilobytes(path: string): Promise<number | null> {
  if (!existsSync(path)) return null;
  const child = Bun.spawn(['df', '-k', path], { stdout: 'pipe', stderr: 'ignore' });
  const output = await new Response(child.stdout).text();
  await child.exited;
  return parseDfAvailableKilobytes(output);
}

// Filho órfão de um supervisor que morreu à força: encerra antes de subir o novo, para não haver dois workers.
export function reapStaleChildren(runDirectory: string): number {
  const stale = readProcessStates(runDirectory).filter(
    (entry) => entry.name !== 'supervisor' && entry.isAlive && entry.pid !== null,
  );
  for (const entry of stale) {
    if (entry.pid !== null) process.kill(entry.pid, 'SIGKILL');
  }
  return stale.length;
}
