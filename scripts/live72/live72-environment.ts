// Copyright (c) 2026 Ada Technology. All rights reserved.
import { parseEnvironment, postgresUrlSchema, z } from '../../packages/environment/src/index.js';
import { HOME_DIRECTORY_NAME } from './live72.constant.js';

const nonEmpty = z.string().min(1);

const live72EnvironmentSchema = z.object({
  HOME: nonEmpty,
  LIVE72_HOME: nonEmpty.optional(),
  DATABASE_URL: postgresUrlSchema,
  API_HOST: nonEmpty,
  API_PORT: z.coerce.number().int().min(1024).max(65535),
  POSTGRES_PORT: z.coerce.number().int().min(1024).max(65535),
  TELEGRAM_API_BASE_URL: z.url(),
  TELEGRAM_WEBHOOK_SECRET: nonEmpty,
  CORS_ALLOWED_ORIGINS: nonEmpty,
  LIVE72_USERNAME: nonEmpty,
  LIVE72_USER_EMAIL: z.email(),
  LIVE72_USER_PASSWORD: nonEmpty,
});

export type Live72Environment = z.infer<typeof live72EnvironmentSchema>;

export type Live72Paths = {
  readonly root: string;
  readonly logs: string;
  readonly run: string;
  readonly runFile: string;
  readonly eventsFile: string;
  readonly reportFile: string;
};

export function loadLive72Environment(
  source: Readonly<Record<string, string | undefined>> = Bun.env,
): Live72Environment {
  return parseEnvironment(live72EnvironmentSchema, source);
}

export function resolveLive72Paths(environment: Live72Environment): Live72Paths {
  const root = environment.LIVE72_HOME ?? `${environment.HOME}/${HOME_DIRECTORY_NAME}`;
  return {
    root,
    logs: `${root}/logs`,
    run: `${root}/run`,
    runFile: `${root}/run.json`,
    eventsFile: `${root}/events.jsonl`,
    reportFile: `${root}/report.md`,
  };
}

export function apiBaseUrl(environment: Live72Environment): string {
  return `http://${environment.API_HOST}:${environment.API_PORT}`;
}
