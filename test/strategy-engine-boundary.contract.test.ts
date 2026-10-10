// Copyright (c) 2026 Ada Technology. All rights reserved.
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
const ALLOWED_IMPORTS: readonly string[] = ['@cryptoada/environment', 'decimal.js', 'node:crypto'];
const IMPORT_PATTERN = /from\s+'([^']+)'/g;
// Relógio, aleatoriedade, rede, disco, processo e console: nada disso cabe num motor puro.
const IMPURE_PATTERN =
  /\bDate\.now\b|\bnew Date\b|\bMath\.random\b|\bperformance\.now\b|\bfetch\(|\bsetTimeout\b|\bsetInterval\b|\bprocess\.|\bBun\.|\bconsole\./;

type Manifest = { readonly dependencies?: Readonly<Record<string, string>> };

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
  test('depends only on the environment package (Zod) and an exact decimal.js', async () => {
    const manifest = (await Bun.file(
      `${REPOSITORY_ROOT}packages/strategy-engine/package.json`,
    ).json()) as Manifest;
    expect(manifest.dependencies).toStrictEqual({
      '@cryptoada/environment': 'workspace:*',
      'decimal.js': '10.6.0',
    });
  });

  test('source imports nothing but relative files and the allowed modules', async () => {
    const offending = (await readEngineSources()).flatMap(({ path, text }) =>
      [...text.matchAll(IMPORT_PATTERN)]
        .map((match) => match[1] ?? '')
        .filter((specifier) => !specifier.startsWith('./') && !ALLOWED_IMPORTS.includes(specifier))
        .map((specifier) => `${path}: ${specifier}`),
    );
    expect(offending).toStrictEqual([]);
  });

  test('source never reads the clock, randomness, network, disk or process', async () => {
    const offending = (await readEngineSources())
      .filter(({ text }) => IMPURE_PATTERN.test(text))
      .map(({ path }) => path);
    expect(offending).toStrictEqual([]);
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
