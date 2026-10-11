// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, test } from 'bun:test';

import { environmentSchema } from '../apps/worker-cryptoada/src/environment.js';
import { EnvironmentError, parseEnvironment } from '../packages/environment/src/index.js';
import { readEnvironmentFile } from './fixtures/environment-file.fixture.js';

type Source = Record<string, string>;

const WORKER_VARIABLES: readonly string[] = [
  'MARKET_EXCHANGE',
  'MARKET_SYMBOLS',
  'MARKET_TIMEFRAMES',
  'BINANCE_BASE_URL',
  'BINANCE_STREAM_URL',
  'STREAM_STALE_SECONDS',
  'STREAM_GAP_LOOKBACK_HOURS',
  'STREAM_GAP_CHECK_MINUTES',
  'LIVE_POLL_SECONDS',
  'LIVE_HEARTBEAT_TIMEOUT_SECONDS',
  'LIVE_GAP_CONFIRM_RECOVERIES',
  'TELEGRAM_BOT_TOKEN',
  'TELEGRAM_API_BASE_URL',
  'ALERT_POLL_SECONDS',
  'ALERT_TELEGRAM_DAILY_LIMIT_PER_USER',
];
const SECRET_FRAGMENT = 'ValorQueNaoPodeVazar';
const PRODUCTION_DATABASE_URL =
  'postgres://cryptoada:prod-password-0123456789-abcdefghijkl@db.internal:5432/crypto?sslmode=verify-full';

async function buildSource(overrides: Source = {}): Promise<Source> {
  const base = await readEnvironmentFile('env.test');
  for (const variable of WORKER_VARIABLES) delete base[variable];
  return { ...base, ...overrides };
}

function issuesOf(source: Source): string {
  try {
    parseEnvironment(environmentSchema, source);
  } catch (error: unknown) {
    if (error instanceof EnvironmentError) return error.message;
    throw error;
  }
  return '';
}

async function buildProductionSource(overrides: Source = {}): Promise<Source> {
  return buildSource({
    ENV: 'production',
    DATABASE_URL: PRODUCTION_DATABASE_URL,
    BINANCE_BASE_URL: 'https://data-api.binance.vision',
    BINANCE_STREAM_URL: 'wss://data-stream.binance.vision',
    TELEGRAM_API_BASE_URL: 'https://api.telegram.org',
    ...overrides,
  });
}

describe('worker environment', () => {
  test('defaults: binance, BTC and ETH, every timeframe, public data hosts, 60 s of silence', async () => {
    const environment = parseEnvironment(environmentSchema, await buildSource());
    expect(environment.MARKET_EXCHANGE).toBe('binance');
    expect(environment.MARKET_SYMBOLS).toStrictEqual(['BTCUSDT', 'ETHUSDT']);
    expect(environment.MARKET_TIMEFRAMES).toStrictEqual(['15m', '1h', '4h', '1d']);
    expect(environment.BINANCE_BASE_URL).toBe('https://data-api.binance.vision');
    expect(environment.BINANCE_STREAM_URL).toBe('wss://data-stream.binance.vision');
    expect(environment.STREAM_STALE_SECONDS).toBe(60);
    expect(environment.STREAM_GAP_LOOKBACK_HOURS).toBe(168);
    expect(environment.STREAM_GAP_CHECK_MINUTES).toBe(15);
  });

  test('simulação ao vivo: ronda de 5 s e batimento vencido em 60 s por padrão, configuráveis', async () => {
    const defaults = parseEnvironment(environmentSchema, await buildSource());
    expect(defaults.LIVE_POLL_SECONDS).toBe(5);
    expect(defaults.LIVE_HEARTBEAT_TIMEOUT_SECONDS).toBe(60);
    const custom = parseEnvironment(
      environmentSchema,
      await buildSource({ LIVE_POLL_SECONDS: '2', LIVE_HEARTBEAT_TIMEOUT_SECONDS: '30' }),
    );
    expect(custom.LIVE_POLL_SECONDS).toBe(2);
    expect(custom.LIVE_HEARTBEAT_TIMEOUT_SECONDS).toBe(30);
  });

  test('buraco de candles: 3 recuperações limpas confirmam por padrão, configurável de 1 a 50', async () => {
    const defaults = parseEnvironment(environmentSchema, await buildSource());
    expect(defaults.LIVE_GAP_CONFIRM_RECOVERIES).toBe(3);
    const custom = parseEnvironment(
      environmentSchema,
      await buildSource({ LIVE_GAP_CONFIRM_RECOVERIES: '10' }),
    );
    expect(custom.LIVE_GAP_CONFIRM_RECOVERIES).toBe(10);
  });

  test('alertas no Telegram: desligados sem token, API pública por padrão, despacho de 2 s configurável', async () => {
    const defaults = parseEnvironment(environmentSchema, await buildSource());
    expect(defaults.TELEGRAM_BOT_TOKEN).toBeUndefined();
    expect(defaults.TELEGRAM_API_BASE_URL).toBe('https://api.telegram.org');
    expect(defaults.ALERT_POLL_SECONDS).toBe(2);
    const custom = parseEnvironment(
      environmentSchema,
      await buildSource({
        TELEGRAM_BOT_TOKEN: '123456789:FAKE_worker_token',
        TELEGRAM_API_BASE_URL: 'http://127.0.0.1:9',
        ALERT_POLL_SECONDS: '10',
      }),
    );
    expect(custom.TELEGRAM_BOT_TOKEN).toBe('123456789:FAKE_worker_token');
    expect(custom.TELEGRAM_API_BASE_URL).toBe('http://127.0.0.1:9');
    expect(custom.ALERT_POLL_SECONDS).toBe(10);
  });

  test('o batimento vence só depois de mais de uma ronda: o prazo menor ou igual ao intervalo falha', async () => {
    const message = issuesOf(
      await buildSource({ LIVE_POLL_SECONDS: '20', LIVE_HEARTBEAT_TIMEOUT_SECONDS: '20' }),
    );
    expect(message).toContain('LIVE_HEARTBEAT_TIMEOUT_SECONDS');
  });

  test('reads the gap lookback window and the periodic check interval', async () => {
    const environment = parseEnvironment(
      environmentSchema,
      await buildSource({ STREAM_GAP_LOOKBACK_HOURS: '720', STREAM_GAP_CHECK_MINUTES: '1' }),
    );
    expect(environment.STREAM_GAP_LOOKBACK_HOURS).toBe(720);
    expect(environment.STREAM_GAP_CHECK_MINUTES).toBe(1);
  });

  test('reads the lists, the stream URL and the silence limit', async () => {
    const environment = parseEnvironment(
      environmentSchema,
      await buildSource({
        MARKET_SYMBOLS: 'SOLUSDT, BTCUSDT',
        MARKET_TIMEFRAMES: '1h,1d',
        BINANCE_STREAM_URL: 'ws://127.0.0.1:9',
        STREAM_STALE_SECONDS: '30',
      }),
    );
    expect(environment.MARKET_SYMBOLS).toStrictEqual(['SOLUSDT', 'BTCUSDT']);
    expect(environment.MARKET_TIMEFRAMES).toStrictEqual(['1h', '1d']);
    expect(environment.BINANCE_STREAM_URL).toBe('ws://127.0.0.1:9');
    expect(environment.STREAM_STALE_SECONDS).toBe(30);
  });

  test.each([
    ['MARKET_EXCHANGE', 'coinbase'],
    ['MARKET_EXCHANGE', 'Binance'],
    ['MARKET_SYMBOLS', 'btcusdt'],
    ['MARKET_TIMEFRAMES', '1m'],
    ['BINANCE_BASE_URL', 'ftp://example.com'],
    ['BINANCE_STREAM_URL', 'https://data-stream.binance.vision'],
    ['STREAM_STALE_SECONDS', '0'],
    ['STREAM_STALE_SECONDS', 'muito'],
    ['STREAM_GAP_LOOKBACK_HOURS', '0'],
    ['STREAM_GAP_LOOKBACK_HOURS', '721'],
    ['STREAM_GAP_LOOKBACK_HOURS', 'muito'],
    ['STREAM_GAP_CHECK_MINUTES', '0'],
    ['STREAM_GAP_CHECK_MINUTES', '1441'],
    ['LIVE_POLL_SECONDS', '0'],
    ['LIVE_POLL_SECONDS', '301'],
    ['LIVE_POLL_SECONDS', 'muito'],
    ['LIVE_HEARTBEAT_TIMEOUT_SECONDS', '4'],
    ['LIVE_HEARTBEAT_TIMEOUT_SECONDS', '3601'],
    ['LIVE_HEARTBEAT_TIMEOUT_SECONDS', 'muito'],
    ['LIVE_GAP_CONFIRM_RECOVERIES', '0'],
    ['LIVE_GAP_CONFIRM_RECOVERIES', '51'],
    ['LIVE_GAP_CONFIRM_RECOVERIES', 'muito'],
    ['ALERT_POLL_SECONDS', '0'],
    ['ALERT_POLL_SECONDS', '61'],
    ['ALERT_POLL_SECONDS', 'muito'],
    ['TELEGRAM_API_BASE_URL', 'ftp://example.com'],
  ])(
    'fails at boot with an invalid %s=%s, naming the variable and never the value',
    async (variable, value) => {
      const message = issuesOf(await buildSource({ [variable]: `${value}${SECRET_FRAGMENT}` }));
      expect(message).toContain(variable);
      expect(message).not.toContain(SECRET_FRAGMENT);
    },
  );

  test('fails without DATABASE_URL', async () => {
    const source = await buildSource();
    delete source['DATABASE_URL'];
    expect(issuesOf(source)).toContain('DATABASE_URL: obrigatória');
  });

  test.each(['env.dev', 'env.test'])('%s is valid for the worker', async (file) => {
    expect(issuesOf(await readEnvironmentFile(file))).toBe('');
  });
});

describe('worker environment in production', () => {
  test('accepts https for REST and wss for the stream', async () => {
    expect(issuesOf(await buildProductionSource())).toBe('');
  });

  test('rejects a plain http:// REST base', async () => {
    const source = await buildProductionSource({ BINANCE_BASE_URL: 'http://insecure.example.com' });
    expect(issuesOf(source)).toContain('BINANCE_BASE_URL');
  });

  test.each(['ws://insecure.example.com', 'https://data-stream.binance.vision'])(
    'rejects the stream URL %s',
    async (value) => {
      const message = issuesOf(await buildProductionSource({ BINANCE_STREAM_URL: value }));
      expect(message).toContain('BINANCE_STREAM_URL');
    },
  );

  test('rejects a plain http:// Telegram API base', async () => {
    const source = await buildProductionSource({
      TELEGRAM_API_BASE_URL: 'http://insecure.example.com',
    });
    expect(issuesOf(source)).toContain('TELEGRAM_API_BASE_URL');
  });

  test('rejects a short bot token, naming the variable and never the value', async () => {
    const source = await buildProductionSource({ TELEGRAM_BOT_TOKEN: `1:curto${SECRET_FRAGMENT}` });
    const message = issuesOf(source);
    expect(message).toContain('TELEGRAM_BOT_TOKEN');
    expect(message).not.toContain(SECRET_FRAGMENT);
  });

  test('rejects a bot token that keeps a development marker', async () => {
    const source = await buildProductionSource({
      TELEGRAM_BOT_TOKEN: '123456789:prod_token_dev_only_padding_0123456789',
    });
    expect(issuesOf(source)).toContain('TELEGRAM_BOT_TOKEN');
  });

  test('rejects a database URL without TLS', async () => {
    const source = await buildProductionSource({ DATABASE_URL: 'postgres://u:p@h:5432/d' });
    expect(issuesOf(source)).toContain('DATABASE_URL');
  });
});

describe('worker environment: teto diário de mensagens do Telegram por usuário', () => {
  test('o padrão é 100 mensagens por usuário nas últimas 24 horas', async () => {
    const environment = parseEnvironment(environmentSchema, await buildSource());
    expect(environment.ALERT_TELEGRAM_DAILY_LIMIT_PER_USER).toBe(100);
  });

  test.each(['1', '1000'])('aceita %s', async (value) => {
    const environment = parseEnvironment(
      environmentSchema,
      await buildSource({ ALERT_TELEGRAM_DAILY_LIMIT_PER_USER: value }),
    );
    expect(environment.ALERT_TELEGRAM_DAILY_LIMIT_PER_USER).toBe(Number(value));
  });

  test.each(['0', '1001', '-1', '1.5', 'muitos'])(
    'recusa %s, nomeando a variável',
    async (value) => {
      const message = issuesOf(await buildSource({ ALERT_TELEGRAM_DAILY_LIMIT_PER_USER: value }));
      expect(message).toContain('ALERT_TELEGRAM_DAILY_LIMIT_PER_USER');
    },
  );
});
