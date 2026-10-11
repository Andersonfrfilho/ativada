// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, test } from 'bun:test';

import { environmentSchema } from '../apps/cron-cryptoada/src/environment.js';
import { EnvironmentError, parseEnvironment } from '../packages/environment/src/index.js';
import { readEnvironmentFile } from './fixtures/environment-file.fixture.js';

type Source = Record<string, string>;

const MARKET_VARIABLES: readonly string[] = [
  'MARKET_EXCHANGE',
  'MARKET_SYMBOLS',
  'MARKET_TIMEFRAMES',
  'BACKFILL_YEARS',
  'BINANCE_BASE_URL',
  'CRON_TASKS',
];

async function buildSource(overrides: Source = {}): Promise<Source> {
  const base = await readEnvironmentFile('env.test');
  for (const variable of MARKET_VARIABLES) delete base[variable];
  return { ...base, ...overrides };
}

function failureOf(source: Source): string {
  try {
    parseEnvironment(environmentSchema, source);
  } catch (error: unknown) {
    if (error instanceof EnvironmentError) return error.message;
    throw error;
  }
  return '';
}

describe('cron market environment', () => {
  test('defaults: binance, BTC and ETH against USDT, every timeframe, two years, public data host', async () => {
    const environment = parseEnvironment(environmentSchema, await buildSource());
    expect(environment.MARKET_EXCHANGE).toBe('binance');
    expect(environment.MARKET_SYMBOLS).toStrictEqual(['BTCUSDT', 'ETHUSDT']);
    expect(environment.MARKET_TIMEFRAMES).toStrictEqual(['15m', '1h', '4h', '1d']);
    expect(environment.BACKFILL_YEARS).toBe(2);
    expect(environment.BINANCE_BASE_URL).toBe('https://data-api.binance.vision');
    expect(environment.CRON_TASKS).toBeUndefined();
  });

  test('reads lists with spaces and a task selection', async () => {
    const environment = parseEnvironment(
      environmentSchema,
      await buildSource({
        MARKET_SYMBOLS: 'SOLUSDT, BTCUSDT',
        MARKET_TIMEFRAMES: '1h,1d',
        BACKFILL_YEARS: '5',
        CRON_TASKS: 'backfill-candles',
      }),
    );
    expect(environment.MARKET_SYMBOLS).toStrictEqual(['SOLUSDT', 'BTCUSDT']);
    expect(environment.MARKET_TIMEFRAMES).toStrictEqual(['1h', '1d']);
    expect(environment.BACKFILL_YEARS).toBe(5);
    expect(environment.CRON_TASKS).toStrictEqual(['backfill-candles']);
  });

  test.each([
    ['MARKET_EXCHANGE', 'coinbase'],
    ['MARKET_EXCHANGE', 'Binance'],
    ['MARKET_EXCHANGE', ''],
    ['MARKET_SYMBOLS', 'btc/usdt'],
    ['MARKET_SYMBOLS', ''],
    ['MARKET_SYMBOLS', 'BTCUSDT,,ETHUSDT'],
    ['MARKET_TIMEFRAMES', '5m'],
    ['MARKET_TIMEFRAMES', '1h,1w'],
    ['BACKFILL_YEARS', '0'],
    ['BACKFILL_YEARS', '6'],
    ['BACKFILL_YEARS', '1.5'],
    ['BACKFILL_YEARS', 'dois'],
    ['BINANCE_BASE_URL', 'not-a-url'],
    ['CRON_TASKS', 'backfill-candle'],
    ['CRON_TASKS', ''],
  ])('%s=%j fails at boot', async (variable, value) => {
    expect(failureOf(await buildSource({ [variable]: value }))).toContain(variable);
  });

  test('production refuses a plain http Binance base URL', async () => {
    const production: Source = {
      ENV: 'production',
      DATABASE_URL:
        'postgres://cryptoada:prod-password-0123456789-abcdefghijkl@db.internal:5432/crypto?sslmode=verify-full',
      KEYCLOAK_TOKEN_URL: 'https://auth.crypto.example.com/token',
      KEYCLOAK_ADMIN_API_URL: 'https://auth.crypto.example.com/admin',
      KEYCLOAK_SERVICE_CLIENT_SECRET: 'S'.repeat(40),
    };
    expect(
      failureOf(
        await buildSource({ ...production, BINANCE_BASE_URL: 'http://binance.example.com' }),
      ),
    ).toContain('BINANCE_BASE_URL');
    expect(
      failureOf(
        await buildSource({ ...production, BINANCE_BASE_URL: 'https://data-api.binance.vision' }),
      ),
    ).toBe('');
  });
});
