// Copyright (c) 2026 Ada Technology. All rights reserved.
import { rm } from 'node:fs/promises';

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { ESLint } from 'eslint';

const REPOSITORY_ROOT: string = new URL('../', import.meta.url).pathname;
const PROBE_DIRECTORY = 'apps/api-ativada/src';
const PROBE_PREFIX = 'lint-boundary-probe-';
const COPYRIGHT_LINE = '// Copyright (c) 2026 Ada Technology. All rights reserved.';
const LINT_TIMEOUT_MILLISECONDS = 120_000;
const RESTRICTED_IMPORTS_RULE = 'no-restricted-imports';
const RESTRICTED_SYNTAX_RULE = 'no-restricted-syntax';
const TYPE_ASSERTIONS_RULE = '@typescript-eslint/consistent-type-assertions';
const ERROR_SEVERITY = 2;

type ProbeCase = {
  readonly name: string;
  readonly body: string;
  readonly expectedRule: string | undefined;
  readonly directory?: string;
  readonly extension?: string;
};

const PROBE_CASES: readonly ProbeCase[] = [
  {
    name: 'drizzle-root',
    body: "import { eq } from 'drizzle-orm';\nexport const PROBE = eq;",
    expectedRule: RESTRICTED_IMPORTS_RULE,
  },
  {
    name: 'drizzle-subpath',
    body: "import { pgTable } from 'drizzle-orm/pg-core';\nexport const PROBE = pgTable;",
    expectedRule: RESTRICTED_IMPORTS_RULE,
  },
  {
    name: 'drizzle-kit',
    body: "import { defineConfig } from 'drizzle-kit';\nexport const PROBE = defineConfig;",
    expectedRule: RESTRICTED_IMPORTS_RULE,
  },
  {
    name: 'bun-sql',
    body: "import { SQL } from 'bun';\nexport const PROBE = SQL;",
    expectedRule: RESTRICTED_IMPORTS_RULE,
  },
  {
    name: 'database-subpath',
    body: "import { userIdFromDatabase } from '@ativada/database/src/ownership/user-id.js';\nexport const PROBE = userIdFromDatabase;",
    expectedRule: RESTRICTED_IMPORTS_RULE,
  },
  {
    name: 'database-relative-path',
    body: "import { userIdFromDatabase } from '../../../packages/database/src/ownership/user-id.js';\nexport const PROBE = userIdFromDatabase;",
    expectedRule: RESTRICTED_IMPORTS_RULE,
  },
  {
    name: 'inline-disable-ignored',
    body: "// eslint-disable-next-line no-restricted-imports\nimport { eq } from 'drizzle-orm';\nexport const PROBE = eq;",
    expectedRule: RESTRICTED_IMPORTS_RULE,
  },
  {
    name: 'user-id-cast',
    body: "import type { UserId } from '@ativada/database';\nexport function forgeUserId(value: string): UserId {\n  return value as UserId;\n}",
    expectedRule: TYPE_ASSERTIONS_RULE,
  },
  {
    name: 'user-id-type-guard',
    body: "import type { UserId } from '@ativada/database';\nexport function isUserId(value: string): value is UserId {\n  return value.length > 0;\n}",
    expectedRule: RESTRICTED_SYNTAX_RULE,
  },
  {
    name: 'bun-sql-global',
    body: 'export function openRawClient(url: string): Bun.SQL {\n  return new Bun.SQL(url);\n}',
    expectedRule: RESTRICTED_SYNTAX_RULE,
  },
  {
    name: 'public-surface-allowed',
    body: "import { parseAccountId, type OwnerScope, type UserId } from '@ativada/database';\nexport const PROBE = parseAccountId;\nexport type ProbeScope = OwnerScope;\nexport type ProbeUserId = UserId;\nexport const PROBE_NAME = 'probe' as const;",
    expectedRule: undefined,
  },
  {
    name: 'dynamic-import-relative',
    body: "export async function loadClient(): Promise<unknown> {\n  return import('../../../packages/database/src/database-client.js');\n}",
    expectedRule: RESTRICTED_SYNTAX_RULE,
  },
  {
    name: 'dynamic-import-worker',
    directory: 'apps/worker-ativada/src',
    body: "export async function loadClient(): Promise<unknown> {\n  return import('../../../packages/database/src/database-client.js');\n}",
    expectedRule: RESTRICTED_SYNTAX_RULE,
  },
  {
    name: 'dynamic-import-cron',
    directory: 'apps/cron-ativada/src',
    body: "export async function loadClient(): Promise<unknown> {\n  return import('../../../packages/database/src/database-client.js');\n}",
    expectedRule: RESTRICTED_SYNTAX_RULE,
  },
  {
    name: 'dynamic-import-frontend-allowed',
    directory: 'apps/frontend-ativada/src',
    body: "export async function loadLazyModule(): Promise<unknown> {\n  return import('./environment.js');\n}",
    expectedRule: undefined,
  },
  {
    name: 'bun-sql-lowercase-member',
    body: 'export const PROBE: unknown = Bun.sql;',
    expectedRule: RESTRICTED_SYNTAX_RULE,
  },
  {
    name: 'bun-sql-computed-member',
    body: "export const PROBE: unknown = Bun['SQL'];",
    expectedRule: RESTRICTED_SYNTAX_RULE,
  },
  {
    name: 'bun-sql-destructuring',
    body: 'const { SQL } = Bun;\nexport const PROBE: unknown = SQL;',
    expectedRule: RESTRICTED_SYNTAX_RULE,
  },
  {
    name: 'bun-sql-alias',
    body: 'const runtime = Bun;\nexport const PROBE: unknown = runtime.sql;',
    expectedRule: RESTRICTED_SYNTAX_RULE,
  },
  {
    name: 'bun-sql-globalthis',
    body: 'export const PROBE: unknown = globalThis.Bun.SQL;',
    expectedRule: RESTRICTED_SYNTAX_RULE,
  },
  {
    name: 'bun-sql-globalthis-destructuring',
    body: 'const { sql } = globalThis.Bun;\nexport const PROBE: unknown = sql;',
    expectedRule: RESTRICTED_SYNTAX_RULE,
  },
  {
    name: 'bun-default-import',
    body: "import bunDefault from 'bun';\nexport const PROBE: unknown = bunDefault;",
    expectedRule: RESTRICTED_IMPORTS_RULE,
  },
  {
    name: 'bun-namespace-import',
    body: "import * as bunNamespace from 'bun';\nexport const PROBE: unknown = bunNamespace;",
    expectedRule: RESTRICTED_IMPORTS_RULE,
  },
  {
    name: 'bun-named-import-allowed',
    body: "import { file } from 'bun';\nexport const PROBE = file;",
    expectedRule: undefined,
  },
  {
    name: 'user-id-overload',
    body: "import type { UserId } from '@ativada/database';\nexport function mintUserId(value: string): UserId;\nexport function mintUserId(value: string): unknown {\n  return value;\n}",
    expectedRule: RESTRICTED_SYNTAX_RULE,
  },
  {
    name: 'owner-scope-function-type',
    body: "import type { OwnerScope } from '@ativada/database';\nexport type ScopeMinter = (value: string) => OwnerScope;",
    expectedRule: RESTRICTED_SYNTAX_RULE,
  },
  {
    name: 'account-id-class-overload',
    body: "import type { AccountId } from '@ativada/database';\nexport class AccountMinter {\n  mint(value: string): AccountId;\n  mint(value: string): unknown {\n    return value;\n  }\n}",
    expectedRule: RESTRICTED_SYNTAX_RULE,
  },
  {
    name: 'user-id-passthrough-allowed',
    body: "import type { UserId } from '@ativada/database';\nexport function readUserId(owner: { readonly userId: UserId }): UserId {\n  return owner.userId;\n}",
    expectedRule: undefined,
  },
  {
    name: 'tsx-valid-component',
    extension: 'tsx',
    directory: 'apps/frontend-ativada/src',
    body: 'export function ProbeView(): unknown {\n  return <span>probe</span>;\n}',
    expectedRule: undefined,
  },
];

function buildProbePath(probeCase: ProbeCase): string {
  const directory = probeCase.directory ?? PROBE_DIRECTORY;
  return `${directory}/${PROBE_PREFIX}${probeCase.name}.${probeCase.extension ?? 'ts'}`;
}

const errorRulesByProbe = new Map<string, readonly string[]>();

async function writeProbes(): Promise<void> {
  await Promise.all(
    PROBE_CASES.map((probeCase) =>
      Bun.write(
        `${REPOSITORY_ROOT}${buildProbePath(probeCase)}`,
        `${COPYRIGHT_LINE}\n${probeCase.body}\n`,
      ),
    ),
  );
}

async function removeProbes(): Promise<void> {
  await Promise.all(
    PROBE_CASES.map((probeCase) =>
      rm(`${REPOSITORY_ROOT}${buildProbePath(probeCase)}`, { force: true }),
    ),
  );
}

async function lintProbes(): Promise<void> {
  const eslint = new ESLint({ cwd: REPOSITORY_ROOT });
  const results = await eslint.lintFiles(PROBE_CASES.map(buildProbePath));
  for (const result of results) {
    const errorRules = result.messages
      .filter((message) => message.severity === ERROR_SEVERITY)
      .map((message) => message.ruleId ?? 'fatal');
    errorRulesByProbe.set(result.filePath, [...new Set(errorRules)].sort());
  }
}

const FORBIDDEN_SOURCE_PATTERN = '**/*.{js,mjs,cjs,jsx,mts,cts}';
const APPS_SOURCE_GLOB = 'apps/*/src';
const FORBIDDEN_EXTENSION_PROBE = `${PROBE_DIRECTORY}/${PROBE_PREFIX}forbidden-extension.mts`;

async function listForbiddenAppSourceFiles(): Promise<readonly string[]> {
  const glob = new Bun.Glob(`${APPS_SOURCE_GLOB}/${FORBIDDEN_SOURCE_PATTERN}`);
  const relativePaths: string[] = [];
  for await (const relativePath of glob.scan({ cwd: REPOSITORY_ROOT })) {
    relativePaths.push(relativePath);
  }
  return relativePaths.sort();
}

describe('apps source language (TypeScript only)', () => {
  afterAll(() => rm(`${REPOSITORY_ROOT}${FORBIDDEN_EXTENSION_PROBE}`, { force: true }));

  test('apps/*/src has no JavaScript or .mts/.cts files', async () => {
    expect(await listForbiddenAppSourceFiles()).toStrictEqual([]);
  });

  test('probe: a .mts file under apps/*/src is detected', async () => {
    await Bun.write(`${REPOSITORY_ROOT}${FORBIDDEN_EXTENSION_PROBE}`, `${COPYRIGHT_LINE}\n`);
    try {
      expect(await listForbiddenAppSourceFiles()).toStrictEqual([FORBIDDEN_EXTENSION_PROBE]);
    } finally {
      await rm(`${REPOSITORY_ROOT}${FORBIDDEN_EXTENSION_PROBE}`, { force: true });
    }
  });
});

describe('apps import boundary (lint)', () => {
  beforeAll(async () => {
    await writeProbes();
    try {
      await lintProbes();
    } finally {
      await removeProbes();
    }
  }, LINT_TIMEOUT_MILLISECONDS);

  afterAll(removeProbes);

  test.each(PROBE_CASES.map((probeCase) => [probeCase.name, probeCase] as const))(
    'probe %s',
    (_probeName, probeCase) => {
      const errorRules = errorRulesByProbe.get(`${REPOSITORY_ROOT}${buildProbePath(probeCase)}`);
      expect(errorRules).toBeDefined();
      if (probeCase.expectedRule === undefined) {
        expect({ probe: probeCase.name, errorRules }).toStrictEqual({
          probe: probeCase.name,
          errorRules: [],
        });
        return;
      }
      expect({
        probe: probeCase.name,
        isRejectedByExpectedRule: errorRules?.includes(probeCase.expectedRule),
      }).toStrictEqual({ probe: probeCase.name, isRejectedByExpectedRule: true });
    },
  );

  test(
    'unsafe any rules stay as errors inside apps',
    async () => {
      const eslint = new ESLint({ cwd: REPOSITORY_ROOT });
      const config = (await eslint.calculateConfigForFile(`${PROBE_DIRECTORY}/main.ts`)) as {
        readonly rules: Readonly<Record<string, readonly unknown[]>>;
      };
      for (const ruleName of [
        '@typescript-eslint/no-unsafe-assignment',
        '@typescript-eslint/no-unsafe-argument',
        TYPE_ASSERTIONS_RULE,
        RESTRICTED_IMPORTS_RULE,
      ]) {
        expect({ ruleName, severity: config.rules[ruleName]?.[0] }).toStrictEqual({
          ruleName,
          severity: ERROR_SEVERITY,
        });
      }
    },
    LINT_TIMEOUT_MILLISECONDS,
  );
});
