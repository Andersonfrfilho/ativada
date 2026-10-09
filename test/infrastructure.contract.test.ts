// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, test } from 'bun:test';

const REPOSITORY_ROOT: string = new URL('../', import.meta.url).pathname;
const ENVIRONMENT_FILE_NAMES: readonly string[] = ['env.dev', 'env.test'];
const REQUIRED_ENVIRONMENT_KEYS: readonly string[] = [
  'PROJECT_NAME',
  'ENV',
  'POSTGRES_PORT',
  'POSTGRES_USER',
  'POSTGRES_PASSWORD',
  'POSTGRES_DB',
  'DATABASE_URL',
  'KEYCLOAK_PORT',
  'MAILPIT_SMTP_PORT',
  'MAILPIT_UI_PORT',
  'KEYCLOAK_ADMIN_USER',
  'KEYCLOAK_ADMIN_PASSWORD',
  'KEYCLOAK_SESSION_CLIENT_SECRET',
  'KEYCLOAK_SERVICE_CLIENT_SECRET',
  'KEYCLOAK_PANEL_ORIGIN',
];
const PUBLISHED_SERVICE_NAMES: readonly string[] = ['postgres', 'keycloak', 'mailpit'];
const PORT_KEYS_BY_SERVICE: Readonly<Record<string, readonly string[]>> = {
  postgres: ['POSTGRES_PORT'],
  keycloak: ['KEYCLOAK_PORT'],
  mailpit: ['MAILPIT_SMTP_PORT', 'MAILPIT_UI_PORT'],
};
const PORT_KEYS: readonly string[] = [
  'POSTGRES_PORT',
  'KEYCLOAK_PORT',
  'MAILPIT_SMTP_PORT',
  'MAILPIT_UI_PORT',
];
const REQUIRED_MAKE_TARGETS: readonly string[] = [
  'bootstrap',
  'config',
  'up',
  'down',
  'ps',
  'check',
  'identity-test',
  'session-test',
];
const CHECK_COMMANDS: readonly string[] = [
  'bun run format:check',
  'bun run lint',
  'bun run typecheck',
  'bun test',
];
const LOCAL_LOOPBACK_PREFIX = '127.0.0.1:';
const PROJECT_NAME_PREFIX = '${PROJECT_NAME}-${ENV}-';

type ComposeService = {
  readonly image?: string;
  readonly container_name?: string;
  readonly ports?: readonly string[];
  readonly healthcheck?: unknown;
};

type ComposeVolume = {
  readonly name?: string;
};

type ComposeFile = {
  readonly services?: Readonly<Record<string, ComposeService>>;
  readonly volumes?: Readonly<Record<string, ComposeVolume | null>>;
};

type EnvironmentValues = Readonly<Record<string, string>>;

async function readRepositoryText(relativePath: string): Promise<string> {
  return Bun.file(`${REPOSITORY_ROOT}${relativePath}`).text();
}

async function readComposeFile(): Promise<ComposeFile> {
  const content = await readRepositoryText('compose.yaml');
  return Bun.YAML.parse(content) as ComposeFile;
}

function parseEnvironmentFile(content: string): EnvironmentValues {
  const entries: [string, string][] = [];
  for (const rawLine of content.split('\n')) {
    const line = rawLine.trim();
    if (line.length === 0 || line.startsWith('#')) continue;
    const separatorIndex = line.indexOf('=');
    entries.push([line.slice(0, separatorIndex), line.slice(separatorIndex + 1)]);
  }
  return Object.fromEntries(entries);
}

function readMakeRecipe(makefile: string, targetName: string): readonly string[] {
  const lines = makefile.split('\n');
  const headerIndex = lines.findIndex((line) => line.startsWith(`${targetName}:`));
  if (headerIndex === -1) return [];
  const recipe: string[] = [];
  for (const line of lines.slice(headerIndex + 1)) {
    if (!line.startsWith('\t')) break;
    recipe.push(line);
  }
  return recipe;
}

async function listTrackedEnvironmentFiles(): Promise<readonly string[]> {
  const gitProcess = Bun.spawn(['git', 'ls-files', 'envs'], {
    cwd: REPOSITORY_ROOT,
    stdout: 'pipe',
  });
  const output = await new Response(gitProcess.stdout).text();
  await gitProcess.exited;
  return output.split('\n').filter((line) => line.length > 0);
}

describe('compose.yaml', () => {
  test.each([...PUBLISHED_SERVICE_NAMES])('declares the %s service', async (serviceName) => {
    const compose = await readComposeFile();
    expect(compose.services?.[serviceName]).toBeDefined();
  });

  test.each([...PUBLISHED_SERVICE_NAMES])(
    'binds every published port of %s to loopback only',
    async (serviceName) => {
      const compose = await readComposeFile();
      const ports = compose.services?.[serviceName]?.ports ?? [];
      expect(ports.length).toBeGreaterThan(0);
      for (const port of ports) {
        expect(port.startsWith(LOCAL_LOOPBACK_PREFIX)).toBe(true);
      }
    },
  );

  test.each([...PUBLISHED_SERVICE_NAMES])(
    'publishes the ports of %s from its own env keys',
    async (serviceName) => {
      const compose = await readComposeFile();
      const ports = compose.services?.[serviceName]?.ports ?? [];
      const expectedKeys = PORT_KEYS_BY_SERVICE[serviceName] ?? [];
      expect(ports.length).toBe(expectedKeys.length);
      for (const key of expectedKeys) {
        expect(ports.some((port) => port.includes(`\${${key}}`))).toBe(true);
      }
    },
  );

  test.each([...PUBLISHED_SERVICE_NAMES])('pins an exact image tag for %s', async (serviceName) => {
    const compose = await readComposeFile();
    const image = compose.services?.[serviceName]?.image ?? '';
    const tag = image.split(':').at(-1) ?? '';
    expect(image.includes(':')).toBe(true);
    expect(tag).not.toBe('latest');
    expect(tag).toMatch(/^v?\d+(\.\d+){0,2}(-[a-z0-9]+)?$/);
  });

  test('pins the keycloak image to a 26.x release', async () => {
    const compose = await readComposeFile();
    const image = compose.services?.['keycloak']?.image ?? '';
    expect(image).toMatch(/^quay\.io\/keycloak\/keycloak:26\.\d+\.\d+$/);
  });

  test.each([...PUBLISHED_SERVICE_NAMES])(
    'prefixes the container name of %s with PROJECT_NAME and ENV',
    async (serviceName) => {
      const compose = await readComposeFile();
      const containerName = compose.services?.[serviceName]?.container_name ?? '';
      expect(containerName.startsWith(PROJECT_NAME_PREFIX)).toBe(true);
    },
  );

  test('prefixes every named volume with PROJECT_NAME and ENV', async () => {
    const compose = await readComposeFile();
    const volumeEntries = Object.entries(compose.volumes ?? {});
    expect(volumeEntries.length).toBeGreaterThan(0);
    for (const [volumeKey, volumeDefinition] of volumeEntries) {
      const volumeName = volumeDefinition?.name ?? volumeKey;
      expect(volumeName.startsWith(PROJECT_NAME_PREFIX)).toBe(true);
    }
  });

  test('persists the keycloak embedded database in a named volume', async () => {
    const compose = await readComposeFile();
    expect(compose.volumes?.['keycloak-data']?.name).toBe(`${PROJECT_NAME_PREFIX}keycloak-data`);
  });

  test('defines a healthcheck for postgres and keycloak', async () => {
    const compose = await readComposeFile();
    expect(compose.services?.['postgres']?.healthcheck).toBeDefined();
    expect(compose.services?.['keycloak']?.healthcheck).toBeDefined();
  });

  test('requires KEYCLOAK_ADMIN_PASSWORD and the client secrets with the :? form', async () => {
    const content = await readRepositoryText('compose.yaml');
    expect(content).toContain('${KEYCLOAK_ADMIN_PASSWORD:?');
    expect(content).toContain('${KEYCLOAK_SESSION_CLIENT_SECRET:?');
    expect(content).toContain('${KEYCLOAK_SERVICE_CLIENT_SECRET:?');
  });

  test('keycloak imports the realm folder read-only', async () => {
    const content = await readRepositoryText('compose.yaml');
    expect(content).toContain('--import-realm');
    expect(content).toMatch(/\.\/realm:\/opt\/keycloak\/data\/import:ro/);
  });
});

describe('envs', () => {
  test.each([...ENVIRONMENT_FILE_NAMES])('%s defines every required key', async (fileName) => {
    const values = parseEnvironmentFile(await readRepositoryText(`envs/${fileName}`));
    for (const key of REQUIRED_ENVIRONMENT_KEYS) {
      expect(values[key]).toBeDefined();
    }
  });

  test('ENV matches the file name for dev and test', async () => {
    const devValues = parseEnvironmentFile(await readRepositoryText('envs/env.dev'));
    const testValues = parseEnvironmentFile(await readRepositoryText('envs/env.test'));
    expect(devValues['ENV']).toBe('dev');
    expect(testValues['ENV']).toBe('test');
  });

  test.each([...PORT_KEYS])('dev and test use different %s values', async (portKey) => {
    const devValues = parseEnvironmentFile(await readRepositoryText('envs/env.dev'));
    const testValues = parseEnvironmentFile(await readRepositoryText('envs/env.test'));
    expect(devValues[portKey]).toBeDefined();
    expect(devValues[portKey]).not.toBe(testValues[portKey]);
  });

  test('every published port is unique across dev and test', async () => {
    const devValues = parseEnvironmentFile(await readRepositoryText('envs/env.dev'));
    const testValues = parseEnvironmentFile(await readRepositoryText('envs/env.test'));
    const ports = [devValues, testValues].flatMap((values) =>
      PORT_KEYS.map((portKey) => values[portKey]),
    );
    expect(new Set(ports).size).toBe(ports.length);
  });

  test.each([...ENVIRONMENT_FILE_NAMES])(
    '%s DATABASE_URL points at its own port and database',
    async (fileName) => {
      const values = parseEnvironmentFile(await readRepositoryText(`envs/${fileName}`));
      const databaseUrl = values['DATABASE_URL'] ?? '';
      expect(databaseUrl).toContain(`:${values['POSTGRES_PORT']}/${values['POSTGRES_DB']}`);
    },
  );
});

describe('Makefile', () => {
  test('reads PROJECT_NAME', async () => {
    const makefile = await readRepositoryText('Makefile');
    expect(makefile).toContain('PROJECT_NAME');
  });

  test('declares every required target as .PHONY', async () => {
    const makefile = await readRepositoryText('Makefile');
    const phonyLine = makefile.split('\n').find((line) => line.startsWith('.PHONY:')) ?? '';
    for (const target of REQUIRED_MAKE_TARGETS) {
      expect(phonyLine.split(/\s+/)).toContain(target);
    }
  });

  test.each([...REQUIRED_MAKE_TARGETS])('defines the %s target', async (target) => {
    const makefile = await readRepositoryText('Makefile');
    expect(makefile.split('\n').some((line) => line.startsWith(`${target}:`))).toBe(true);
  });

  test('check runs format, lint, typecheck and tests in that order', async () => {
    const makefile = await readRepositoryText('Makefile');
    const recipe = readMakeRecipe(makefile, 'check');
    const positions = CHECK_COMMANDS.map((command) =>
      recipe.findIndex((line) => line.includes(command)),
    );
    expect(positions.every((position) => position >= 0)).toBe(true);
    expect([...positions].sort((first, second) => first - second)).toEqual(positions);
  });
});

describe('environment files in git', () => {
  test('no envs/*.local file is versioned', async () => {
    const trackedFiles = await listTrackedEnvironmentFiles();
    expect(trackedFiles.filter((file) => file.endsWith('.local'))).toEqual([]);
  });
});
