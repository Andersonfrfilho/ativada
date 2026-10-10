// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, test } from 'bun:test';

import { environmentSchema } from '../apps/api-cryptoada/src/environment.js';
import { EnvironmentError, parseEnvironment } from '../packages/environment/src/index.js';
import { readEnvironmentFile } from './fixtures/environment-file.fixture.js';

const DEFAULT_WALK_FORWARD_TIMEOUT_SECONDS = 3_600;

function issuesOf(run: () => unknown): string {
  try {
    run();
  } catch (error: unknown) {
    if (error instanceof EnvironmentError) return error.issues.join('\n');
  }
  return '';
}

describe('ambiente da API das rotas de mercado e execuções (T3.4)', () => {
  test('pares, timeframes e corretora habilitados vêm do ambiente (os mesmos do cron e do worker)', async () => {
    const base = await readEnvironmentFile('env.test');
    const parsed = parseEnvironment(environmentSchema, {
      ...base,
      MARKET_SYMBOLS: 'BTCUSDT,SOLUSDT',
      MARKET_TIMEFRAMES: '1h,1d',
    });
    expect(parsed.MARKET_EXCHANGE).toBe('binance');
    expect(parsed.MARKET_SYMBOLS).toStrictEqual(['BTCUSDT', 'SOLUSDT']);
    expect(parsed.MARKET_TIMEFRAMES).toStrictEqual(['1h', '1d']);
  });

  test('timeframe fora dos quatro e símbolo em minúsculas são recusados, nomeando a variável', async () => {
    const base = await readEnvironmentFile('env.test');
    expect(
      issuesOf(() => parseEnvironment(environmentSchema, { ...base, MARKET_TIMEFRAMES: '2h' })),
    ).toContain('MARKET_TIMEFRAMES');
    expect(
      issuesOf(() => parseEnvironment(environmentSchema, { ...base, MARKET_SYMBOLS: 'btcusdt' })),
    ).toContain('MARKET_SYMBOLS');
  });

  test('o tempo limite do walk-forward tem padrão de 3.600 s e aceita de 5 a 86.400', async () => {
    const base = await readEnvironmentFile('env.test');
    expect(parseEnvironment(environmentSchema, base).WALK_FORWARD_TIMEOUT_SECONDS).toBe(
      DEFAULT_WALK_FORWARD_TIMEOUT_SECONDS,
    );
    for (const value of ['5', '600', '86400']) {
      const parsed = parseEnvironment(environmentSchema, {
        ...base,
        WALK_FORWARD_TIMEOUT_SECONDS: value,
      });
      expect(parsed.WALK_FORWARD_TIMEOUT_SECONDS).toBe(Number(value));
    }
    for (const value of ['4', '86401', '1.5', 'abc']) {
      expect(
        issuesOf(() =>
          parseEnvironment(environmentSchema, { ...base, WALK_FORWARD_TIMEOUT_SECONDS: value }),
        ),
      ).toContain('WALK_FORWARD_TIMEOUT_SECONDS');
    }
  });
});
