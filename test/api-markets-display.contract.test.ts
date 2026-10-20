// Copyright (c) 2026 Ada Technology. All rights reserved.
import { readRetentionMeta } from '../apps/api-ativada/src/markets/display-retention.js';
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';

import type { CandleRecord } from '../packages/database/src/index.js';
import {
  createRunsHarness,
  EXCHANGE,
  NOW,
  readJson,
  SUBJECT_A,
  type RunsHarness,
} from './fixtures/api-routes/runs-harness.fixture.js';

const THREE_MINUTES = 180_000;
const DAY = 86_400_000;
const RETENTION_DAYS = 90;
const FIRST_OPEN = Date.UTC(2026, 8, 1);
const CANDLE_COUNT = 5_500;

let harness: RunsHarness;

function buildDisplayCandles(): readonly CandleRecord<'3m'>[] {
  return Array.from({ length: CANDLE_COUNT }, (_unused, index) => {
    const openTime = FIRST_OPEN + index * THREE_MINUTES;
    return {
      exchange: EXCHANGE,
      symbol: 'BTCUSDT',
      timeframe: '3m' as const,
      openTime,
      closeTime: openTime + THREE_MINUTES - 1,
      open: '30000.10000000',
      high: '30100.00000000',
      low: '29900.00000000',
      close: '30050.50000000',
      volume: '1.25000000',
      tradeCount: 7 + index,
    };
  });
}

beforeAll(async () => {
  harness = await createRunsHarness({
    displayCandles: buildDisplayCandles(),
    displayTimeframes: ['3m'],
    displayRetentionDays: RETENTION_DAYS,
  });
});

afterAll(async () => {
  await harness.stop();
});

function candlesPath(query: Record<string, string>): string {
  return `/v1/markets/candles?${new URLSearchParams(query).toString()}`;
}

function displayQuery(overrides: Record<string, string> = {}): Record<string, string> {
  return {
    symbol: 'BTCUSDT',
    timeframe: '3m',
    from: String(FIRST_OPEN),
    to: String(FIRST_OPEN + 5 * THREE_MINUTES),
    ...overrides,
  };
}

type CandlesBody = { data: Record<string, unknown>[]; meta?: Record<string, unknown> };

describe('GET /v1/markets/candles with a display timeframe', () => {
  test('returns the 3m candles of [from, to) and the start of the retention', async () => {
    const { status, body } = await readJson(
      await harness.call({ subject: SUBJECT_A, path: candlesPath(displayQuery()) }),
    );
    const parsed = body as CandlesBody;
    expect(status).toBe(200);
    expect(parsed.data).toHaveLength(5);
    expect(parsed.data[0]?.['openTime']).toBe(FIRST_OPEN);
    expect(parsed.data[0]?.['closeTime']).toBe(FIRST_OPEN + THREE_MINUTES - 1);
    const expectedStart = Math.ceil((NOW - RETENTION_DAYS * DAY) / THREE_MINUTES) * THREE_MINUTES;
    expect(parsed.meta).toStrictEqual({ retentionStart: expectedStart });
    expect(expectedStart % THREE_MINUTES).toBe(0);
  });

  test('an execution timeframe response keeps the old body, without meta', async () => {
    const { status, body } = await readJson(
      await harness.call({
        subject: SUBJECT_A,
        path: candlesPath(displayQuery({ timeframe: '1h' })),
      }),
    );
    expect(status).toBe(200);
    expect(Object.keys(body as object)).toStrictEqual(['data']);
  });

  test('the range cap is counted in 3m candles', async () => {
    const tooLarge = String(FIRST_OPEN + 5_001 * THREE_MINUTES);
    const response = await harness.call({
      subject: SUBJECT_A,
      path: candlesPath(displayQuery({ to: tooLarge })),
    });
    expect(response.status).toBe(400);
    const allowed = String(FIRST_OPEN + 5_000 * THREE_MINUTES);
    const { body } = await readJson(
      await harness.call({ subject: SUBJECT_A, path: candlesPath(displayQuery({ to: allowed })) }),
    );
    expect((body as CandlesBody).data).toHaveLength(5_000);
  });

  test('a timeframe nobody enabled is still refused', async () => {
    const response = await harness.call({
      subject: SUBJECT_A,
      path: candlesPath(displayQuery({ timeframe: '5m' })),
    });
    expect(response.status).toBe(400);
  });
});

describe('a deployment without display timeframes', () => {
  test('refuses 3m as not enabled', async () => {
    const plain = await createRunsHarness();
    try {
      const response = await plain.call({
        subject: SUBJECT_A,
        path: candlesPath(displayQuery()),
      });
      expect(response.status).toBe(400);
    } finally {
      await plain.stop();
    }
  });
});

describe('retention start per display timeframe', () => {
  const RETENTION_NOW = Date.UTC(2026, 5, 1, 12, 0, 30);
  const DAY_MILLISECONDS = 86_400_000;
  const retention = { days: { '1m': 30, '3m': 90 }, now: (): number => RETENTION_NOW };

  test('1m uses its own 30 days on the 1 min grid, 3m keeps its 90', (): void => {
    const oneMinute = readRetentionMeta('1m', retention);
    const threeMinutes = readRetentionMeta('3m', retention);
    expect(oneMinute?.retentionStart).toBe(
      Math.ceil((RETENTION_NOW - 30 * DAY_MILLISECONDS) / 60_000) * 60_000,
    );
    expect(threeMinutes?.retentionStart).toBe(
      Math.ceil((RETENTION_NOW - 90 * DAY_MILLISECONDS) / 180_000) * 180_000,
    );
  });

  test('execution candles have no retention start', () => {
    expect(readRetentionMeta('15m', retention)).toBeUndefined();
  });
});
