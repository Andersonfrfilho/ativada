// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, test } from 'bun:test';

import {
  CANDLE_PAGE_SIZE,
  MAX_CANDLES_IN_MEMORY,
  PAGING_EDGE_BARS,
} from '../src/runs/candle-chart/candle-chart.constant.js';
import {
  capCandles,
  mergeCandlePages,
  previousPageRange,
  shouldRequestPreviousPage,
} from '../src/runs/candle-chart/candle-paging.js';
import {
  INITIAL_HISTORY_STATE,
  reduceHistory,
} from '../src/runs/candle-chart/candle-history.reducer.js';
import type { MarketCandle } from '../src/runs/candle-chart/market-candles.validation.js';
import { HOUR_MILLISECONDS } from './support/candle-chart-fixtures.js';

const CANDLE: MarketCandle = {
  openTime: 0,
  closeTime: 1,
  tradeCount: 1,
  open: '1',
  high: '1',
  low: '1',
  close: '1',
  volume: '1',
};

const FIRST_OPEN_TIME = 5_000 * HOUR_MILLISECONDS;

type TestCandle = { readonly openTime: number; readonly close: string };

function candlesAt(openTimes: readonly number[], close: string = '1'): TestCandle[] {
  return openTimes.map((openTime) => ({ openTime, close }));
}

describe('candle paging', () => {
  test('asks for the previous page only near the left edge, once, and while there is more', () => {
    const base = { firstVisibleIndex: 10, isLoading: false, hasMore: true };
    expect(shouldRequestPreviousPage(base)).toBe(true);
    expect(shouldRequestPreviousPage({ ...base, firstVisibleIndex: PAGING_EDGE_BARS - 1 })).toBe(
      true,
    );
    expect(shouldRequestPreviousPage({ ...base, firstVisibleIndex: PAGING_EDGE_BARS })).toBe(false);
    expect(shouldRequestPreviousPage({ ...base, isLoading: true })).toBe(false);
    expect(shouldRequestPreviousPage({ ...base, hasMore: false })).toBe(false);
  });

  test('the previous page ends on the first candle we have, so that candle is not fetched again', () => {
    const range = previousPageRange({
      firstOpenTime: FIRST_OPEN_TIME,
      timeframeMilliseconds: HOUR_MILLISECONDS,
      earliestTime: 0,
    });
    expect(range).toStrictEqual({
      from: FIRST_OPEN_TIME - CANDLE_PAGE_SIZE * HOUR_MILLISECONDS,
      to: FIRST_OPEN_TIME,
    });
  });

  test('the range stops at the earliest candle the pair has, and ends when nothing is left', () => {
    const params = { firstOpenTime: FIRST_OPEN_TIME, timeframeMilliseconds: HOUR_MILLISECONDS };
    const nearEarliest = FIRST_OPEN_TIME - 10 * HOUR_MILLISECONDS;
    expect(previousPageRange({ ...params, earliestTime: nearEarliest })).toStrictEqual({
      from: nearEarliest,
      to: FIRST_OPEN_TIME,
    });
    expect(previousPageRange({ ...params, earliestTime: FIRST_OPEN_TIME })).toBeUndefined();
    expect(previousPageRange({ ...params, earliestTime: FIRST_OPEN_TIME + 1 })).toBeUndefined();
  });

  test('an empty or short page does not end the history: only the reached edge does', () => {
    const loaded = reduceHistory(INITIAL_HISTORY_STATE, {
      type: 'replace',
      candles: [{ ...CANDLE, openTime: 900 }],
      timeframe: '1h',
      paging: { hasMore: true, reachedFrom: 800 },
    });
    const afterEmpty = reduceHistory(loaded, {
      type: 'prepend',
      candles: [],
      paging: { hasMore: true, reachedFrom: 500 },
    });
    expect(afterEmpty.hasMore).toBe(true);
    expect(afterEmpty.reachedFrom).toBe(500);
    expect(afterEmpty.candles).toHaveLength(1);
    const atStart = reduceHistory(afterEmpty, {
      type: 'prepend',
      candles: [{ ...CANDLE, openTime: 400 }],
      paging: { hasMore: false, reachedFrom: 0 },
    });
    expect(atStart.hasMore).toBe(false);
  });

  test('a failed page keeps hasMore and the candles, and releases the loading flag', () => {
    const loading = reduceHistory(
      reduceHistory(INITIAL_HISTORY_STATE, {
        type: 'replace',
        candles: [{ ...CANDLE, openTime: 900 }],
        timeframe: '1h',
        paging: { hasMore: true, reachedFrom: 800 },
      }),
      { type: 'loadingPrevious' },
    );
    const failed = reduceHistory(loading, { type: 'failed', scope: 'page' });
    expect(failed.hasMore).toBe(true);
    expect(failed.isLoadingPrevious).toBe(false);
    expect(failed.status).toBe('ready');
    const seriesFailed = reduceHistory(failed, { type: 'failed', scope: 'series' });
    expect(seriesFailed.status).toBe('error');
    expect(reduceHistory(seriesFailed, { type: 'retry' }).status).toBe('loading');
  });

  test('merging pages never duplicates a candle and keeps time order', () => {
    const current = candlesAt([3, 4, 5]);
    const previous = candlesAt([0, 1, 2, 3]);
    const merged = mergeCandlePages(current, previous);
    expect(merged.map((item) => item.openTime)).toStrictEqual([0, 1, 2, 3, 4, 5]);
    expect(mergeCandlePages(merged, previous)).toStrictEqual(merged);
    expect(mergeCandlePages(merged, [])).toStrictEqual(merged);
  });

  test('the newer copy of the same candle wins', () => {
    const merged = mergeCandlePages(candlesAt([1, 2], 'old'), candlesAt([2, 3], 'new'));
    expect(merged).toStrictEqual([
      { openTime: 1, close: 'old' },
      { openTime: 2, close: 'new' },
      { openTime: 3, close: 'new' },
    ]);
  });

  test('five pages of 1.000 candles merge to exactly 5.000 with no repeat', () => {
    let merged = candlesAt(Array.from({ length: 1_000 }, (_unused, index) => 4_000 + index));
    for (let page = 3; page >= 0; page -= 1) {
      const times = Array.from({ length: 1_000 }, (_unused, index) => page * 1_000 + index);
      merged = mergeCandlePages(merged, candlesAt(times));
    }
    expect(merged).toHaveLength(5_000);
    expect(new Set(merged.map((item) => item.openTime)).size).toBe(5_000);
  });

  test('the memory cap drops the candles farthest from the focus', () => {
    const times = Array.from({ length: MAX_CANDLES_IN_MEMORY + 5 }, (_unused, index) => index);
    const all = candlesAt(times);
    expect(capCandles(all, MAX_CANDLES_IN_MEMORY + 4)[0]?.openTime).toBe(5);
    expect(capCandles(all, 0).at(-1)?.openTime).toBe(MAX_CANDLES_IN_MEMORY - 1);
    const middle = capCandles(all, 10_000);
    expect(middle).toHaveLength(MAX_CANDLES_IN_MEMORY);
    expect(middle.some((item) => item.openTime === 10_000)).toBe(true);
  });

  test('under the cap nothing is dropped', () => {
    const small = candlesAt([1, 2, 3]);
    expect(capCandles(small, 2)).toStrictEqual(small);
  });
});
