// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, test } from 'bun:test';

const REPOSITORY_ROOT: string = new URL('../', import.meta.url).pathname;
const COPYRIGHT_LINE = '// Copyright (c) 2026 Ada Technology. All rights reserved.';
const WORKSPACE_DIRECTORIES: readonly string[] = [
  'apps/api-ativada',
  'apps/worker-ativada',
  'apps/cron-ativada',
  'apps/frontend-ativada',
  'packages/strategy-engine',
  'packages/database',
  'packages/environment',
  'packages/identity-admin',
  'packages/market-data-crypto',
];
const REQUIRED_COMPILER_OPTIONS: Readonly<Record<string, boolean>> = {
  strict: true,
  noUncheckedIndexedAccess: true,
  exactOptionalPropertyTypes: true,
  noImplicitOverride: true,
  verbatimModuleSyntax: true,
};
const DEFAULT_EXPORT_PATTERN = /export\s+default\b/;

type PackageManifest = {
  readonly name?: string;
  readonly private?: boolean;
  readonly type?: string;
  readonly version?: string;
  readonly workspaces?: readonly string[];
};

type TsconfigBase = {
  readonly compilerOptions?: Record<string, unknown>;
};

async function readJsonFile<TValue>(relativePath: string): Promise<TValue> {
  return (await Bun.file(`${REPOSITORY_ROOT}${relativePath}`).json()) as TValue;
}

async function listTypeScriptSourceFiles(): Promise<readonly string[]> {
  const patterns: readonly string[] = [
    'apps/*/src/**/*.ts',
    'packages/*/src/**/*.ts',
    'test/**/*.ts',
  ];
  const collectedFiles: string[] = [];
  for (const pattern of patterns) {
    const glob = new Bun.Glob(pattern);
    for await (const relativePath of glob.scan({ cwd: REPOSITORY_ROOT })) {
      collectedFiles.push(relativePath);
    }
  }
  return collectedFiles;
}

async function readFirstLine(relativePath: string): Promise<string> {
  const text = await Bun.file(`${REPOSITORY_ROOT}${relativePath}`).text();
  return text.split(/\r?\n/, 1)[0] ?? '';
}

describe('workspace contract', () => {
  test('tsconfig.base.json enables the strict compiler options', async () => {
    const tsconfigBase = await readJsonFile<TsconfigBase>('tsconfig.base.json');
    for (const [optionName, expectedValue] of Object.entries(REQUIRED_COMPILER_OPTIONS)) {
      expect(tsconfigBase.compilerOptions?.[optionName]).toBe(expectedValue);
    }
  });

  test('root package.json is private, ESM and declares the workspaces', async () => {
    const rootManifest = await readJsonFile<PackageManifest>('package.json');
    expect(rootManifest.private).toBe(true);
    expect(rootManifest.type).toBe('module');
    expect(rootManifest.workspaces).toEqual(['apps/*', 'packages/*']);
  });

  test('every workspace has a package.json and a src/index.ts with the expected name', async () => {
    for (const workspaceDirectory of WORKSPACE_DIRECTORIES) {
      const workspaceName = workspaceDirectory.split('/').at(-1) ?? '';
      const manifest = await readJsonFile<PackageManifest>(`${workspaceDirectory}/package.json`);
      expect(manifest.name).toBe(`@ativada/${workspaceName}`);
      expect(manifest.private).toBe(true);
      expect(manifest.type).toBe('module');
      expect(await Bun.file(`${REPOSITORY_ROOT}${workspaceDirectory}/src/index.ts`).exists()).toBe(
        true,
      );
    }
  });

  test('no TypeScript source file under src or test has a default export', async () => {
    const sourceFiles = await listTypeScriptSourceFiles();
    expect(sourceFiles.length).toBeGreaterThan(0);
    for (const relativePath of sourceFiles) {
      const text = await Bun.file(`${REPOSITORY_ROOT}${relativePath}`).text();
      expect({ relativePath, hasDefaultExport: DEFAULT_EXPORT_PATTERN.test(text) }).toEqual({
        relativePath,
        hasDefaultExport: false,
      });
    }
  });

  test('every TypeScript source file starts with the copyright line', async () => {
    const sourceFiles = await listTypeScriptSourceFiles();
    expect(sourceFiles.length).toBeGreaterThan(0);
    for (const relativePath of sourceFiles) {
      expect({ relativePath, firstLine: await readFirstLine(relativePath) }).toEqual({
        relativePath,
        firstLine: COPYRIGHT_LINE,
      });
    }
  });
});
