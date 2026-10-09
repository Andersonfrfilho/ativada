// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, test } from 'bun:test';
import {
  EnvironmentError,
  parseEnvironment,
  postgresUrlSchema,
  z,
} from '../packages/environment/src/index.js';
import { loadEnvironment as loadFrontendEnvironment } from '../apps/frontend-crypto/src/environment.js';

const REPOSITORY_ROOT: string = new URL('../', import.meta.url).pathname;
const ENVIRONMENT_ERROR_PREFIX = 'Variáveis de ambiente inválidas';
const SERVER_APPLICATIONS: readonly string[] = ['api-crypto', 'worker-crypto', 'cron-crypto'];
const ENVIRONMENT_EXEMPT_FILES: readonly string[] = [
  'packages/database/src/read-database-url.ts',
  'packages/database/drizzle.config.ts',
];
const ENVIRONMENT_ACCESS_PATTERN = /process\.env|import\.meta\.env/;
const SECRET_VALUE = 'SEGREDO_NAO_VAZAR';
const MALFORMED_DATABASE_URL = 'abc-segredo-123';

const TEST_SCHEMA = z.object({
  ENV: z.enum(['dev', 'test', 'production']),
  DATABASE_URL: z.string().url(),
  API_PORT: z.coerce.number().int().min(1024).max(65535),
});

type ProcessResult = {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
};

function captureError(action: () => unknown): unknown {
  try {
    action();
  } catch (error) {
    return error;
  }
  return undefined;
}

async function readEnvironmentFile(fileName: string): Promise<Record<string, string>> {
  const content = await Bun.file(`${REPOSITORY_ROOT}envs/${fileName}`).text();
  const entries: [string, string][] = [];
  for (const rawLine of content.split('\n')) {
    const line = rawLine.trim();
    if (line.length === 0 || line.startsWith('#')) continue;
    const separatorIndex = line.indexOf('=');
    entries.push([line.slice(0, separatorIndex), line.slice(separatorIndex + 1)]);
  }
  return Object.fromEntries(entries);
}

async function runServerApplication(
  applicationName: string,
  environment: Readonly<Record<string, string>>,
): Promise<ProcessResult> {
  const child = Bun.spawn([process.execPath, 'run', `apps/${applicationName}/src/main.ts`], {
    cwd: REPOSITORY_ROOT,
    env: { ...environment },
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const [stdout, stderr] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  const exitCode = await child.exited;
  return { exitCode, stdout, stderr };
}

async function listEnvironmentViolations(): Promise<readonly string[]> {
  const patterns: readonly string[] = ['apps/*/src/**/*.ts', 'packages/*/src/**/*.ts'];
  const violations: string[] = [];
  for (const pattern of patterns) {
    const glob = new Bun.Glob(pattern);
    for await (const relativePath of glob.scan({ cwd: REPOSITORY_ROOT })) {
      if (relativePath.endsWith('/environment.ts')) continue;
      if (ENVIRONMENT_EXEMPT_FILES.includes(relativePath)) continue;
      const text = await Bun.file(`${REPOSITORY_ROOT}${relativePath}`).text();
      if (ENVIRONMENT_ACCESS_PATTERN.test(text)) violations.push(relativePath);
    }
  }
  return violations;
}

describe('parseEnvironment', () => {
  test('returns the coerced and typed object when every variable is valid', () => {
    const values = parseEnvironment(TEST_SCHEMA, {
      ENV: 'test',
      DATABASE_URL: 'postgres://crypto:crypto_test_only@127.0.0.1:56433/crypto_test',
      API_PORT: '53101',
    });
    expect(values.API_PORT).toBe(53101);
    expect(values.ENV).toBe('test');
  });

  test('throws EnvironmentError listing every problem at once, in Portuguese', () => {
    const error = captureError(() => parseEnvironment(TEST_SCHEMA, {}));
    expect(error).toBeInstanceOf(EnvironmentError);
    const environmentError = error as EnvironmentError;
    expect(environmentError.message.startsWith(ENVIRONMENT_ERROR_PREFIX)).toBe(true);
    expect(environmentError.issues).toHaveLength(3);
    for (const variableName of ['ENV', 'DATABASE_URL', 'API_PORT']) {
      expect(environmentError.message).toContain(variableName);
    }
  });

  test('never echoes an invalid value in the error message', () => {
    const invalidEnvironmentError = captureError(() =>
      parseEnvironment(TEST_SCHEMA, {
        ENV: 'staging',
        DATABASE_URL: `postgres://user:${SECRET_VALUE}@host/db`,
        API_PORT: '53101',
      }),
    ) as EnvironmentError;
    expect(invalidEnvironmentError).toBeInstanceOf(EnvironmentError);
    expect(invalidEnvironmentError.message).not.toContain(SECRET_VALUE);

    const malformedEnvironmentError = captureError(() =>
      parseEnvironment(TEST_SCHEMA, {
        ENV: 'dev',
        DATABASE_URL: MALFORMED_DATABASE_URL,
        API_PORT: '53101',
      }),
    ) as EnvironmentError;
    expect(malformedEnvironmentError).toBeInstanceOf(EnvironmentError);
    expect(malformedEnvironmentError.message).not.toContain(MALFORMED_DATABASE_URL);
    expect(malformedEnvironmentError.issues.join('\n')).not.toContain(MALFORMED_DATABASE_URL);
  });
});

describe('server applications fail at boot without environment', () => {
  test.each([...SERVER_APPLICATIONS])(
    '%s exits 1 with a clear message when the env is empty',
    async (applicationName) => {
      const result = await runServerApplication(applicationName, {});
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain(ENVIRONMENT_ERROR_PREFIX);
      expect(result.stderr).toContain('DATABASE_URL');
    },
  );

  test.each([...SERVER_APPLICATIONS])(
    '%s boots with a valid env and logs one JSON info line',
    async (applicationName) => {
      const testEnvironment = await readEnvironmentFile('env.test');
      const result = await runServerApplication(applicationName, testEnvironment);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('"level":"info"');
      expect(result.stdout).toContain(`"app":"${applicationName}"`);
    },
  );
});

describe('frontend environment', () => {
  test('loadEnvironment returns VITE_API_URL when it is present', () => {
    const environment = loadFrontendEnvironment({ VITE_API_URL: 'http://127.0.0.1:56001' });
    expect(environment.VITE_API_URL).toBe('http://127.0.0.1:56001');
  });

  test('loadEnvironment throws EnvironmentError when VITE_API_URL is missing', () => {
    const error = captureError(() => loadFrontendEnvironment({}));
    expect(error).toBeInstanceOf(EnvironmentError);
  });
});

describe('environment access is confined to environment modules', () => {
  test('no source file reads process.env or import.meta.env outside the allowed modules', async () => {
    expect(await listEnvironmentViolations()).toEqual([]);
  });
});

describe('postgres URL schema is shared', () => {
  test('accepts postgres:// and postgresql:// URLs', () => {
    expect(postgresUrlSchema.safeParse('postgres://u:p@127.0.0.1:5432/db').success).toBe(true);
    expect(postgresUrlSchema.safeParse('postgresql://u:p@h/db').success).toBe(true);
  });

  test('rejects other protocols and non-URLs', () => {
    expect(postgresUrlSchema.safeParse('mysql://x/y').success).toBe(false);
    expect(postgresUrlSchema.safeParse('abc').success).toBe(false);
  });

  test('no app environment module repeats the postgres URL rule', async () => {
    const glob = new Bun.Glob('apps/*/src/environment.ts');
    const offenders: string[] = [];
    for await (const relativePath of glob.scan({ cwd: REPOSITORY_ROOT })) {
      const text = await Bun.file(`${REPOSITORY_ROOT}${relativePath}`).text();
      if (text.includes('postgresql') || text.includes('postgres://')) offenders.push(relativePath);
    }
    expect(offenders).toEqual([]);
  });
});
