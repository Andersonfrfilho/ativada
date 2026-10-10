// Copyright (c) 2026 Ada Technology. All rights reserved.
import { afterAll, describe, expect, test } from 'bun:test';

import {
  closeDatabase,
  createCandleRepository,
  CLOCK_SKEW_TOLERANCE_MILLISECONDS,
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
  test('rejects a closeTime beyond now plus the clock skew tolerance', async () => {
    const openCandle = buildCandle({
      closeTime: NOW_MILLISECONDS + CLOCK_SKEW_TOLERANCE_MILLISECONDS + 1,
    });
    expect(await captureRejection(repository.upsertCandles([openCandle]))).toBeInstanceOf(
      OpenCandleRejectedError,
    );
  });

  test('keeps a closed stream candle when the local clock is behind, up to the tolerance', async () => {
    for (const closeTime of [
      NOW_MILLISECONDS,
      NOW_MILLISECONDS + CLOCK_SKEW_TOLERANCE_MILLISECONDS,
    ]) {
      const outcome = await captureRejection(
        repository.upsertCandles([buildCandle({ closeTime })]),
      );
      expect(outcome).not.toBeInstanceOf(OpenCandleRejectedError);
    }
  });

  test('the tolerance is five seconds', () => {
    expect(CLOCK_SKEW_TOLERANCE_MILLISECONDS).toBe(5_000);
  });

  test('rejects the whole batch when only one candle is open, before touching the database', async () => {
    const batch = [
      buildCandle({}),
      buildCandle({
        openTime: 1,
        closeTime: NOW_MILLISECONDS + 3 * CLOCK_SKEW_TOLERANCE_MILLISECONDS,
      }),
    ];
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

describe('candle repository: gap detection short-circuits', () => {
  const key = { exchange: 'binance', symbol: 'BTCUSDT', timeframe: '1h' } as const;

  test('an empty or inverted range has no expected open times and never touches the database', async () => {
    const from = NOW_MILLISECONDS;
    expect(await repository.findMissingOpenTimes({ ...key, from, to: from })).toStrictEqual([]);
    expect(await repository.findMissingOpenTimes({ ...key, from, to: from - 1 })).toStrictEqual([]);
  });

  test('a range that holds no grid point has no expected open times and never touches the database', async () => {
    const insideOneHour = 1_800_000_000_000 - (1_800_000_000_000 % 3_600_000) + 1;
    expect(
      await repository.findMissingOpenTimes({
        ...key,
        from: insideOneHour,
        to: insideOneHour + 60,
      }),
    ).toStrictEqual([]);
  });
});
