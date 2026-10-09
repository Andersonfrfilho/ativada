// Copyright (c) 2026 Ada Technology. All rights reserved.
import { afterAll, describe, expect, test } from 'bun:test';

import {
  closeDatabase,
  createCandleRepository,
  OpenCandleRejectedError,
  openDatabase,
  type CandleRecord,
} from '../packages/database/src/index.js';

const NOW_MILLISECONDS = 1_800_000_000_000;
const UNREACHABLE_DATABASE_URL = 'postgres://user:password@127.0.0.1:1/unreachable';

function buildCandle(overrides: Partial<CandleRecord>): CandleRecord {
  return {
    exchange: 'binance',
    symbol: 'BTCUSDT',
    timeframe: '1h',
    openTime: NOW_MILLISECONDS - 7_200_000,
    closeTime: NOW_MILLISECONDS - 3_600_001,
    open: '82514.01000000',
    high: '82600.00000000',
    low: '82400.00000000',
    close: '82500.00000000',
    volume: '12.50000000',
    tradeCount: 100,
    ...overrides,
  };
}

async function captureRejection(attempt: Promise<unknown>): Promise<unknown> {
  try {
    await attempt;
    return undefined;
  } catch (error: unknown) {
    return error;
  }
}

const handle = openDatabase(UNREACHABLE_DATABASE_URL);
const repository = createCandleRepository(handle, { now: () => NOW_MILLISECONDS });

afterAll(async () => {
  await closeDatabase(handle);
});

describe('candle repository: a candle that has not closed is never stored (constitution §3)', () => {
  test('rejects closeTime equal to now', async () => {
    const openCandle = buildCandle({ closeTime: NOW_MILLISECONDS });
    expect(await captureRejection(repository.upsertCandles([openCandle]))).toBeInstanceOf(
      OpenCandleRejectedError,
    );
  });

  test('rejects closeTime in the future', async () => {
    const openCandle = buildCandle({ closeTime: NOW_MILLISECONDS + 1 });
    expect(await captureRejection(repository.upsertCandles([openCandle]))).toBeInstanceOf(
      OpenCandleRejectedError,
    );
  });

  test('rejects the whole batch when only one candle is open, before touching the database', async () => {
    const batch = [buildCandle({}), buildCandle({ openTime: 1, closeTime: NOW_MILLISECONDS })];
    expect(await captureRejection(repository.upsertCandles(batch))).toBeInstanceOf(
      OpenCandleRejectedError,
    );
  });

  test('accepts closeTime one millisecond before now (the failure is the unreachable database)', async () => {
    const closedCandle = buildCandle({ closeTime: NOW_MILLISECONDS - 1 });
    const outcome = await captureRejection(repository.upsertCandles([closedCandle]));
    expect(outcome).not.toBeInstanceOf(OpenCandleRejectedError);
  });

  test('an empty batch stores nothing and never touches the database', async () => {
    expect(await repository.upsertCandles([])).toStrictEqual({ inserted: 0 });
  });
});
