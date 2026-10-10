// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, test } from 'bun:test';
import {
  EnvironmentError,
  parseEnvironment,
  postgresUrlSchema,
  z,
} from '../packages/environment/src/index.js';
import { readEnvironmentFile } from './fixtures/environment-file.fixture.js';
import { loadEnvironment as loadFrontendEnvironment } from '../apps/frontend-cryptoada/src/environment.js';

const REPOSITORY_ROOT: string = new URL('../', import.meta.url).pathname;
const LONG_RUNNING_APPLICATION = 'api-cryptoada';
const LISTENING_MESSAGE = '"message":"listening"';
const ENVIRONMENT_ERROR_PREFIX = 'Variáveis de ambiente inválidas';
const CRON_APPLICATION = 'cron-cryptoada';
const SERVER_APPLICATIONS: readonly string[] = [
  'api-cryptoada',
  'worker-cryptoada',
  CRON_APPLICATION,
];
const IDLE_APPLICATIONS: readonly string[] = SERVER_APPLICATIONS.filter(
  (applicationName) => applicationName !== CRON_APPLICATION,
);
const UNREACHABLE_DATABASE_PASSWORD = 'SENHA_DO_BANCO_INALCANCAVEL';
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

async function collectOutput(
  stream: ReadableStream<Uint8Array>,
  onChunk: (text: string) => void,
): Promise<string> {
  const decoder = new TextDecoder();
  let text = '';
  for await (const chunk of stream) {
    const decoded = decoder.decode(chunk, { stream: true });
    text += decoded;
    onChunk(text);
  }
  return text;
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
  const isLongRunning = applicationName === LONG_RUNNING_APPLICATION;
  const [stdout, stderr] = await Promise.all([
    collectOutput(child.stdout, (text) => {
      if (isLongRunning && text.includes(LISTENING_MESSAGE)) child.kill('SIGTERM');
    }),
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
      DATABASE_URL: 'postgres://cryptoada:cryptoada_test_only@127.0.0.1:56433/cryptoada_test',
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

  test.each([...IDLE_APPLICATIONS])(
    '%s boots with a valid env, logs JSON info and exits 0 (the API after SIGTERM)',
    async (applicationName) => {
      const testEnvironment = await readEnvironmentFile('env.test');
      const result = await runServerApplication(applicationName, testEnvironment);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('"level":"info"');
      expect(result.stdout).toContain(`"app":"${applicationName}"`);
    },
  );
});

describe('cron application', () => {
  test('with a valid env but an unreachable database it logs a JSON error, exits 1 and leaks no secret', async () => {
    const testEnvironment = await readEnvironmentFile('env.test');
    const result = await runServerApplication(CRON_APPLICATION, {
      ...testEnvironment,
      DATABASE_URL: `postgres://cryptoada:${UNREACHABLE_DATABASE_PASSWORD}@127.0.0.1:1/unreachable`,
    });
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain('"level":"error"');
    expect(result.stdout).toContain(`"app":"${CRON_APPLICATION}"`);
    expect(result.stdout + result.stderr).not.toContain(UNREACHABLE_DATABASE_PASSWORD);
    expect(result.stdout + result.stderr).not.toContain(
      testEnvironment['KEYCLOAK_SERVICE_CLIENT_SECRET'] ?? 'unset',
    );
  });

  test('requires the Keycloak service-account variables', async () => {
    const testEnvironment = await readEnvironmentFile('env.test');
    const { KEYCLOAK_SERVICE_CLIENT_SECRET: omittedSecret, ...withoutSecret } = testEnvironment;
    const result = await runServerApplication(CRON_APPLICATION, withoutSecret);
    expect(omittedSecret).toBeDefined();
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('KEYCLOAK_SERVICE_CLIENT_SECRET');
  });
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
