// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, test } from 'bun:test';

const REPOSITORY_ROOT: string = new URL('../', import.meta.url).pathname;
const DATABASE_PACKAGE_DIRECTORY = 'packages/database';
const MIGRATIONS_DIRECTORY = `${DATABASE_PACKAGE_DIRECTORY}/drizzle`;
const ROLLBACK_SUFFIX = '.rollback.sql';
const MIGRATION_FILE_PATTERN = /^\d{4}_.+\.sql$/;
const CREATE_ENUM_TYPE_PATTERN = /CREATE\s+TYPE[^;]*\bAS\s+ENUM\b/i;

type PackageManifest = {
  readonly name?: string;
  readonly private?: boolean;
  readonly type?: string;
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

describe('@crypto/database package', () => {
  test('package.json is private, ESM and named @crypto/database', async () => {
    const manifest = JSON.parse(
      await readRepositoryText(`${DATABASE_PACKAGE_DIRECTORY}/package.json`),
    ) as PackageManifest;
    expect(manifest.name).toBe('@crypto/database');
    expect(manifest.private).toBe(true);
    expect(manifest.type).toBe('module');
  });

  test('src/index.ts exports createDatabaseClient', async () => {
    const source = await readRepositoryText(`${DATABASE_PACKAGE_DIRECTORY}/src/index.ts`);
    const exportsCreateDatabaseClient =
      /export\s+(?:async\s+)?function\s+createDatabaseClient\b/.test(source) ||
      /export\s*\{[^}]*\bcreateDatabaseClient\b[^}]*\}/.test(source);
    expect(exportsCreateDatabaseClient).toBe(true);
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
