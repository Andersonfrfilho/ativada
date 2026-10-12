// Copyright (c) 2026 Ada Technology. All rights reserved.
import { COMPOSE_PROJECT } from './live72.constant.js';
import { REPOSITORY_ROOT } from './live72-paths.js';

export function composeCommand(): string[] {
  return [
    'docker',
    'compose',
    '--env-file',
    `${REPOSITORY_ROOT}/envs/env.live72`,
    '-p',
    COMPOSE_PROJECT,
    '-f',
    `${REPOSITORY_ROOT}/compose.yaml`,
  ];
}

export async function runCompose(args: readonly string[]): Promise<number> {
  const child = Bun.spawn([...composeCommand(), ...args], {
    cwd: REPOSITORY_ROOT,
    stdin: 'ignore',
    stdout: 'inherit',
    stderr: 'inherit',
  });
  return child.exited;
}
