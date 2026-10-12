// Copyright (c) 2026 Ada Technology. All rights reserved.
const ROOT_URL = new URL('../../', import.meta.url);

export const REPOSITORY_ROOT: string = ROOT_URL.pathname.replace(/\/$/, '');
export const SUPERVISOR_SCRIPT = `${REPOSITORY_ROOT}/scripts/live72/supervisor.ts`;
export const ENV_FILE = `${REPOSITORY_ROOT}/envs/env.live72`;
export const CLI_SCRIPT = `${REPOSITORY_ROOT}/scripts/live72/cli.ts`;
