// Copyright (c) 2026 Ada Technology. All rights reserved.
import { posix } from 'node:path';

import { describe, expect, test } from 'bun:test';

import {
  TIMEFRAME,
  TIMEFRAME_DURATION_MILLISECONDS,
  type Candle,
} from '../packages/market-data/src/index.js';
import {
  ENGINE_TIMEFRAME,
  ENGINE_TIMEFRAME_DURATION_MILLISECONDS,
  parseStrategyConfig,
  RULE_FAMILY,
  type EngineCandle,
} from '../packages/strategy-engine/src/index.js';
import { loadClassicScoreboard } from './fixtures/strategy-engine/engine-scenarios.fixture.js';

const REPOSITORY_ROOT: string = new URL('../', import.meta.url).pathname;
const ENGINE_SOURCE = 'packages/strategy-engine/src';
const ALLOWED_IMPORTS: readonly string[] = ['zod', 'decimal.js', 'node:crypto'];
const IMPORT_PATTERN = /from\s+'([^']+)'/g;
const NODE_CRYPTO_IMPORT_PATTERN = /import\s+(type\s+)?\{([^}]*)\}\s+from\s+'node:crypto'/g;
// Relógio, aleatoriedade, rede, disco, processo, console, locale, carga dinâmica e matemática com
// precisão dependente de implementação: nada disso cabe num motor puro. É rede, não a única defesa.
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

function findImpurity(text: string): RegExp | undefined {
  return IMPURE_PATTERNS.find((pattern) => pattern.test(text));
}

type Manifest = { readonly dependencies?: Readonly<Record<string, string>> };

// Relativo que continua dentro de `src` (o subdiretório `risk/` importa `../engine-decimal.js`).
function isInsideEngine(path: string, specifier: string): boolean {
  if (!specifier.startsWith('.')) return false;
  return !posix.join(posix.dirname(path), specifier).startsWith('..');
}

async function readEngineSources(): Promise<readonly { path: string; text: string }[]> {
  const sources: { path: string; text: string }[] = [];
  for await (const relativePath of new Bun.Glob('**/*.ts').scan({
    cwd: `${REPOSITORY_ROOT}${ENGINE_SOURCE}`,
  })) {
    sources.push({
      path: relativePath,
      text: await Bun.file(`${REPOSITORY_ROOT}${ENGINE_SOURCE}/${relativePath}`).text(),
    });
  }
  return sources;
}

describe('strategy engine boundary', () => {
  test('depends only on exact versions of decimal.js and zod (the hash depends on Zod semantics)', async () => {
    const manifest = (await Bun.file(
      `${REPOSITORY_ROOT}packages/strategy-engine/package.json`,
    ).json()) as Manifest;
    expect(manifest.dependencies).toStrictEqual({ 'decimal.js': '10.6.0', zod: '4.6.5' });
  });

  test('source imports nothing but relative files and the allowed modules', async () => {
    const offending = (await readEngineSources()).flatMap(({ path, text }) =>
      [...text.matchAll(IMPORT_PATTERN)]
        .map((match) => match[1] ?? '')
        .filter(
          (specifier) => !isInsideEngine(path, specifier) && !ALLOWED_IMPORTS.includes(specifier),
        )
        .map((specifier) => `${path}: ${specifier}`),
    );
    expect(offending).toStrictEqual([]);
  });

  test('source never reads the clock, randomness, locale, network, disk or process', async () => {
    const offending = (await readEngineSources())
      .map(({ path, text }) => [path, findImpurity(text)?.source] as const)
      .filter(([, pattern]) => pattern !== undefined);
    expect(offending).toStrictEqual([]);
  });

  test('the impurity net catches every forbidden sample (probe)', () => {
    const missed = FORBIDDEN_SAMPLES.filter((sample) => findImpurity(sample) === undefined);
    expect(missed).toStrictEqual([]);
    expect(findImpurity('/** comentário */ const total = left * right;')).toBeUndefined();
  });

  test('node:crypto is imported only for createHash', async () => {
    const names = (await readEngineSources()).flatMap(({ text }) =>
      [...text.matchAll(NODE_CRYPTO_IMPORT_PATTERN)].flatMap((match) =>
        (match[2] ?? '')
          .split(',')
          .map((name) => name.trim())
          .filter((name) => name !== ''),
      ),
    );
    expect(new Set(names)).toStrictEqual(new Set(['createHash']));
  });

  test('a market-data candle is an engine candle and the timeframes agree', () => {
    const candle: Candle = {
      symbol: 'BTCUSDT',
      timeframe: TIMEFRAME.ONE_HOUR,
      openTime: 0,
      closeTime: 3_599_999,
      open: '1',
      high: '1',
      low: '1',
      close: '1',
      volume: '1',
      tradeCount: 1,
    };
    const engineCandle: EngineCandle = candle;
    expect(engineCandle.timeframe).toBe(ENGINE_TIMEFRAME.ONE_HOUR);
    expect(Object.values(ENGINE_TIMEFRAME)).toStrictEqual(Object.values(TIMEFRAME));
    expect(ENGINE_TIMEFRAME_DURATION_MILLISECONDS).toStrictEqual(TIMEFRAME_DURATION_MILLISECONDS);
  });

  test('the classic scoreboard rules belong to the families of plan §4', () => {
    const families = parseStrategyConfig(loadClassicScoreboard()).rules.map(
      (rule) => RULE_FAMILY[rule.kind],
    );
    expect(families).toStrictEqual(['trend', 'trend', 'reversion', 'volume']);
  });
});
