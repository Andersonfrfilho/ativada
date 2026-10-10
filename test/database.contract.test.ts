// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, test } from 'bun:test';

import * as databasePublicSurface from '../packages/database/src/index.js';

const REPOSITORY_ROOT: string = new URL('../', import.meta.url).pathname;
const DATABASE_PACKAGE_DIRECTORY = 'packages/database';
const MIGRATIONS_DIRECTORY = `${DATABASE_PACKAGE_DIRECTORY}/drizzle`;
const ROLLBACK_SUFFIX = '.rollback.sql';
const MIGRATION_FILE_PATTERN = /^\d{4}_.+\.sql$/;
const CREATE_ENUM_TYPE_PATTERN = /CREATE\s+TYPE[^;]*\bAS\s+ENUM\b/i;
const PUBLIC_RUNTIME_EXPORTS: readonly string[] = [
  'AUDIT_ACTOR_KIND',
  'CLOCK_SKEW_TOLERANCE_MILLISECONDS',
  'DISPLAY_CURRENCY',
  'DISPLAY_NAME_MAX_LENGTH',
  'InvalidUserIdError',
  'LINK_OUTCOME',
  'OpenCandleRejectedError',
  'RUN_KIND',
  'RUN_STATUS',
  'RUN_TRANSITION_OUTCOME',
  'TIMEZONE_MAX_LENGTH',
  'USER_RESOLUTION_STATUS',
  'WALK_FORWARD_WINDOW_STATUS',
  'closeDatabase',
  'createAccountDeletionRepository',
  'createAccountExportRepository',
  'createAccountPurgeRepository',
  'createAdminAccountRepository',
  'createAuditEventRepository',
  'createAuditRetentionRepository',
  'createBlockedAccountRepository',
  'createCandleRepository',
  'createProfileRepository',
  'createRunBatchRepository',
  'createRunRepository',
  'createRunResultRepository',
  'createSentimentObservationRepository',
  'createSentimentRepository',
  'createStrategyRepository',
  'createTelegramLinkConsumer',
  'createTelegramLinkRepository',
  'isDatabaseError',
  'openDatabase',
  'parseAccountId',
  'pingDatabase',
  'readPostgresErrorCode',
  'resolveRunOwnerScope',
  'resolveUserBySubject',
];

type PackageManifest = {
  readonly name?: string;
  readonly private?: boolean;
  readonly type?: string;
  readonly exports?: unknown;
};

async function readRepositoryText(relativePath: string): Promise<string> {
  return Bun.file(`${REPOSITORY_ROOT}${relativePath}`).text();
}

async function listMigrationFileNames(): Promise<readonly string[]> {
  const glob = new Bun.Glob('*.sql');
  const fileNames: string[] = [];
  for await (const fileName of glob.scan({ cwd: `${REPOSITORY_ROOT}${MIGRATIONS_DIRECTORY}` })) {
    fileNames.push(fileName);
  }
  return fileNames.filter((fileName) => !fileName.endsWith(ROLLBACK_SUFFIX)).sort();
}

function buildRollbackFileName(migrationFileName: string): string {
  return `${migrationFileName.slice(0, -'.sql'.length)}${ROLLBACK_SUFFIX}`;
}

describe('@cryptoada/database package', () => {
  test('package.json is private, ESM and named @cryptoada/database', async () => {
    const manifest = JSON.parse(
      await readRepositoryText(`${DATABASE_PACKAGE_DIRECTORY}/package.json`),
    ) as PackageManifest;
    expect(manifest.name).toBe('@cryptoada/database');
    expect(manifest.private).toBe(true);
    expect(manifest.type).toBe('module');
  });

  test('package.json exposes only the root entry point', async () => {
    const manifest = JSON.parse(
      await readRepositoryText(`${DATABASE_PACKAGE_DIRECTORY}/package.json`),
    ) as PackageManifest;
    expect(manifest.exports).toStrictEqual({ '.': './src/index.ts' });
  });

  test('the public entry point exports only the allowed runtime values', () => {
    expect(Object.keys(databasePublicSurface).sort()).toStrictEqual([...PUBLIC_RUNTIME_EXPORTS]);
  });

  test('the public entry point does not export the owner scope factory', async () => {
    const source = await readRepositoryText(`${DATABASE_PACKAGE_DIRECTORY}/src/index.ts`);
    expect(Object.keys(databasePublicSurface)).not.toContain('createOwnerScope');
    expect(source).not.toMatch(/\bcreateOwnerScope\b/);
    expect(source).toMatch(/export\s+type\s*\{[^}]*\bOwnerScope\b/);
  });

  test('the database handle is opaque and exposes no client or table', () => {
    const handle = databasePublicSurface.openDatabase(
      'postgres://user:password@127.0.0.1:1/unreachable',
    );
    expect(Object.keys(handle)).toStrictEqual([]);
    expect(Object.getOwnPropertySymbols(handle)).toStrictEqual([]);
    expect(Object.isFrozen(handle)).toBe(true);
  });

  test('the frontend does not depend on @cryptoada/database', async () => {
    const manifest = JSON.parse(
      await readRepositoryText('apps/frontend-cryptoada/package.json'),
    ) as {
      readonly dependencies?: Readonly<Record<string, string>>;
      readonly devDependencies?: Readonly<Record<string, string>>;
    };
    const dependencyNames = [
      ...Object.keys(manifest.dependencies ?? {}),
      ...Object.keys(manifest.devDependencies ?? {}),
    ];
    expect(dependencyNames).not.toContain('@cryptoada/database');
  });

  test('the public entry point has no wildcard re-export', async () => {
    const source = await readRepositoryText(`${DATABASE_PACKAGE_DIRECTORY}/src/index.ts`);
    expect(source).not.toMatch(/export\s+\*/);
  });

  test('drizzle.config.ts targets the postgresql dialect', async () => {
    const config = await readRepositoryText(`${DATABASE_PACKAGE_DIRECTORY}/drizzle.config.ts`);
    expect(config).toMatch(/dialect:\s*['"]postgresql['"]/);
  });
});

describe('migrations', () => {
  test('there is at least one migration', async () => {
    const migrationFileNames = await listMigrationFileNames();
    expect(migrationFileNames.length).toBeGreaterThan(0);
  });

  test('every migration matches the NNNN_ prefix pattern', async () => {
    for (const migrationFileName of await listMigrationFileNames()) {
      expect(MIGRATION_FILE_PATTERN.test(migrationFileName)).toBe(true);
    }
  });

  test('every migration has a rollback file with the same base name', async () => {
    for (const migrationFileName of await listMigrationFileNames()) {
      const rollbackPath = `${REPOSITORY_ROOT}${MIGRATIONS_DIRECTORY}/${buildRollbackFileName(migrationFileName)}`;
      expect({
        migrationFileName,
        rollbackExists: await Bun.file(rollbackPath).exists(),
      }).toEqual({ migrationFileName, rollbackExists: true });
    }
  });

  test('no migration creates a native ENUM type', async () => {
    for (const migrationFileName of await listMigrationFileNames()) {
      const sql = await readRepositoryText(`${MIGRATIONS_DIRECTORY}/${migrationFileName}`);
      expect({ migrationFileName, createsEnum: CREATE_ENUM_TYPE_PATTERN.test(sql) }).toEqual({
        migrationFileName,
        createsEnum: false,
      });
    }
  });
});
