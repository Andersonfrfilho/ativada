// Copyright (c) 2026 Ada Technology. All rights reserved.
import { posix } from 'node:path';

import { describe, expect, test } from 'bun:test';

const REPOSITORY_ROOT: string = new URL('../', import.meta.url).pathname;
const PACKAGE_DIRECTORY = 'packages/risk-analyst';
const ALLOWED_PACKAGES: readonly string[] = ['@ativada/strategy-engine', '@ativada/statistics'];
const IMPORT_PATTERN = /from\s+'([^']+)'/g;
// O mesmo cordão do motor: relógio, aleatoriedade, rede, disco, processo, console, locale, carga dinâmica e matemática com
// precisão dependente de implementação não cabem numa regra pura.
const IMPURE_PATTERNS: readonly RegExp[] = [
  /\bDate\.now\b/,
  /\bDate\(/,
  /\bglobalThis\.Date\b/,
  /\bMath\.random\b/,
  /\bperformance\.now\b/,
  /\bcrypto\.randomUUID\b/,
  /\bgetRandomValues\b/,
  /\brandomBytes\b/,
  /\bfetch\(/,
  /\bsetTimeout\b/,
  /\bsetInterval\b/,
  /\bprocess\./,
  /\bBun\./,
  /\bconsole\./,
  /\btoLocale[A-Za-z]*\(/,
  /\bIntl\./,
  /\blocaleCompare\b/,
  /\brequire\(/,
  /\bimport\(/,
  /\bMath\.(exp|expm1|log|log1p|log2|log10|pow|cbrt|sinh|cosh|tanh|sin|cos|tan|atan2?|hypot)\b/,
  /[^/*]\*\*[^/]/,
];
const FORBIDDEN_SAMPLES: readonly string[] = [
  'Date.now()',
  'new Date()',
  'const day = Date();',
  'globalThis.Date',
  'Math.random()',
  'performance.now()',
  'crypto.randomUUID()',
  'crypto.getRandomValues(buffer)',
  'randomBytes(16)',
  'await fetch(url)',
  'setTimeout(run, 1)',
  'setInterval(run, 1)',
  'process.env.X',
  'Bun.file(path)',
  'console.log(value)',
  'value.toLocaleString()',
  'Intl.NumberFormat',
  'a.localeCompare(b)',
  "require('x')",
  "await import('./x.js')",
  'Math.exp(1)',
  'Math.log(2)',
  'Math.pow(2, 3)',
  'const square = side ** 2;',
];
// O Wilson tem um lugar só (`@ativada/statistics`): z, raiz quadrada e a desigualdade inteira não se repetem aqui.
const WILSON_DUPLICATE_PATTERNS: readonly RegExp[] = [/1\.96/, /3\.8416/, /2401n/, /\.sqrt\(/];

function findImpurity(text: string): RegExp | undefined {
  return IMPURE_PATTERNS.find((pattern) => pattern.test(text));
}

type Manifest = { readonly dependencies?: Readonly<Record<string, string>> };

// `export default` e `as Tipo` (só `as const` passa), olhando o código: comentário e texto entre aspas ficam de fora.
function findAssertionOrDefault(text: string): string | undefined {
  const code = text
    .replace(/\/\/.*$/gm, '')
    .replace(/'(?:[^'\\\n]|\\.)*'/g, "''")
    .replace(/`(?:[^`\\]|\\.)*`/gs, '``');
  return /\bexport\s+default\b|\bas\s+(?!const\b)\w/.exec(code)?.[0];
}

async function readSources(): Promise<readonly { path: string; text: string }[]> {
  const sources: { path: string; text: string }[] = [];
  for await (const relativePath of new Bun.Glob('**/*.ts').scan({
    cwd: `${REPOSITORY_ROOT}${PACKAGE_DIRECTORY}/src`,
  })) {
    sources.push({
      path: relativePath,
      text: await Bun.file(`${REPOSITORY_ROOT}${PACKAGE_DIRECTORY}/src/${relativePath}`).text(),
    });
  }
  return sources;
}

function isForeignImport(path: string, specifier: string): boolean {
  if (!specifier.startsWith('.')) return !ALLOWED_PACKAGES.includes(specifier);
  return posix.join(posix.dirname(path), specifier).startsWith('..');
}

describe('risk analyst boundary', () => {
  test('depends only on the engine and the statistics workspace packages (no new dependency)', async () => {
    const manifest = (await Bun.file(
      `${REPOSITORY_ROOT}${PACKAGE_DIRECTORY}/package.json`,
    ).json()) as Manifest;
    expect(manifest.dependencies).toStrictEqual({
      '@ativada/statistics': 'workspace:*',
      '@ativada/strategy-engine': 'workspace:*',
    });
  });

  test('is a workspace package with the entry point the others resolve', async () => {
    const manifest = (await Bun.file(
      `${REPOSITORY_ROOT}${PACKAGE_DIRECTORY}/package.json`,
    ).json()) as {
      name: string;
      main: string;
      exports: Record<string, string>;
    };
    expect(manifest.name).toBe('@ativada/risk-analyst');
    expect(manifest.main).toBe('src/index.ts');
    expect(manifest.exports).toStrictEqual({ '.': './src/index.ts' });
  });

  test('source imports nothing but relative files and the two workspace packages', async () => {
    const offending = (await readSources()).flatMap(({ path, text }) =>
      [...text.matchAll(IMPORT_PATTERN)]
        .map((match) => match[1] ?? '')
        .filter((specifier) => isForeignImport(path, specifier))
        .map((specifier) => `${path}: ${specifier}`),
    );
    expect(offending).toStrictEqual([]);
  });

  test('source never reads the clock, randomness, locale, network, disk or process', async () => {
    const offending = (await readSources())
      .map(({ path, text }) => [path, findImpurity(text)?.source] as const)
      .filter(([, pattern]) => pattern !== undefined);
    expect(offending).toStrictEqual([]);
  });

  test('the impurity net catches every forbidden sample (probe)', () => {
    const missed = FORBIDDEN_SAMPLES.filter((sample) => findImpurity(sample) === undefined);
    expect(missed).toStrictEqual([]);
    expect(findImpurity('/** comentário */ const total = left * right;')).toBeUndefined();
  });

  test('the Wilson interval is imported from @ativada/statistics, never written again', async () => {
    const offending = (await readSources())
      .map(
        ({ path, text }) =>
          [path, WILSON_DUPLICATE_PATTERNS.find((pattern) => pattern.test(text))?.source] as const,
      )
      .filter(([, pattern]) => pattern !== undefined);
    expect(offending).toStrictEqual([]);
    const sample = '1.96 3.8416 2401n x.sqrt(';
    expect(WILSON_DUPLICATE_PATTERNS.every((pattern) => pattern.test(sample))).toBe(true);
  });

  test('source has no default export and no type assertion other than as const', async () => {
    const offending = (await readSources())
      .map(({ path, text }) => [path, findAssertionOrDefault(text)] as const)
      .filter(([, found]) => found !== undefined);
    expect(offending).toStrictEqual([]);
  });

  test('the assertion net flags `as Type` and `export default`, not `as const` nor the word in a phrase (probe)', () => {
    expect(findAssertionOrDefault('const value = raw as Foo;')).toBeDefined();
    expect(findAssertionOrDefault('export default function f() {}')).toBeDefined();
    expect(findAssertionOrDefault('const table = { a: 1 } as const;')).toBeUndefined();
    expect(findAssertionOrDefault("const phrase = 'as saídas continuam';")).toBeUndefined();
    expect(findAssertionOrDefault('// as saídas\nconst a = 1;')).toBeUndefined();
  });
});
