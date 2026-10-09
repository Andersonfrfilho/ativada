// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, test } from 'bun:test';

const REPOSITORY_ROOT: string = new URL('../', import.meta.url).pathname;
const DATABASE_PACKAGE = 'packages/database';
const TEST_ONLY_FILE_PATTERN = /(-checks|-test|temporary-database|rollback)\.ts$/;
const CONSOLE_PATTERN = /\bconsole\./;
const INTEGRATION_ENTRYPOINTS: readonly string[] = ['database-test.ts', 'migration-test.ts'];

async function listFiles(pattern: string): Promise<readonly string[]> {
  const glob = new Bun.Glob(pattern);
  const files: string[] = [];
  for await (const file of glob.scan({ cwd: REPOSITORY_ROOT })) files.push(file);
  return files.sort();
}

async function readText(relativePath: string): Promise<string> {
  return Bun.file(`${REPOSITORY_ROOT}${relativePath}`).text();
}

describe('código de integração fora de src', () => {
  test('packages/database/src has no check, integration entrypoint or temporary-database helper', async () => {
    const files = await listFiles(`${DATABASE_PACKAGE}/src/**/*.ts`);
    expect(files.filter((file) => TEST_ONLY_FILE_PATTERN.test(file))).toStrictEqual([]);
  });

  test('the integration scripts live in packages/database/test-support', async () => {
    const files = await listFiles(`${DATABASE_PACKAGE}/test-support/*.ts`);
    for (const entrypoint of INTEGRATION_ENTRYPOINTS) {
      expect(files).toContain(`${DATABASE_PACKAGE}/test-support/${entrypoint}`);
    }
  });

  test('the package scripts point at test-support', async () => {
    const manifest = JSON.parse(await readText(`${DATABASE_PACKAGE}/package.json`)) as {
      readonly scripts: Readonly<Record<string, string>>;
    };
    expect(manifest.scripts['db:migration-test']).toContain('test-support/migration-test.ts');
    expect(manifest.scripts['db:database-test']).toContain('test-support/database-test.ts');
  });

  test('test-support is type-checked by the package and by the root tsconfig', async () => {
    const packageConfig = await readText(`${DATABASE_PACKAGE}/tsconfig.json`);
    const rootConfig = await readText('tsconfig.json');
    expect(packageConfig).toContain('test-support');
    expect(rootConfig).toContain('packages/*/test-support');
  });

  test('no source file of an app or package calls console', async () => {
    const files = [
      ...(await listFiles('apps/*/src/**/*.{ts,tsx}')),
      ...(await listFiles('packages/*/src/**/*.ts')),
    ];
    const offenders: string[] = [];
    for (const file of files) {
      if (CONSOLE_PATTERN.test(await readText(file))) offenders.push(file);
    }
    expect(offenders).toStrictEqual([]);
  });

  test('the ESLint config bans console in src and leaves test-support free to print', async () => {
    const config = await readText('eslint.config.js');
    expect(config).toMatch(/'no-console':\s*'error'/);
    expect(config).toContain('packages/*/test-support');
  });
});
