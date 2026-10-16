// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, test } from 'bun:test';

import { computeCandleWindow, withLeadingContext } from '../src/runs/candle-chart/candle-window.js';

const HOUR = 3_600_000;
const EXTENT = { from: 0, to: 3_000 * HOUR };

describe('janela da primeira página de velas', () => {
  test('following the end: the last 1,000 candles of the run', () => {
    const window = computeCandleWindow({
      extent: EXTENT,
      range: undefined,
      focus: undefined,
      timeframeMilliseconds: HOUR,
    });
    expect(window).toEqual({ range: { from: 2_000 * HOUR, to: 3_000 * HOUR }, anchor: 'end' });
  });

  test('a run shorter than one page starts at its own beginning', () => {
    const window = computeCandleWindow({
      extent: { from: 500 * HOUR, to: 900 * HOUR },
      range: undefined,
      focus: undefined,
      timeframeMilliseconds: HOUR,
    });
    expect(window.range).toEqual({ from: 500 * HOUR, to: 900 * HOUR });
  });

  test('a range from the URL is shown whole, or its last 1,000 candles when it is longer', () => {
    const short = computeCandleWindow({
      extent: EXTENT,
      range: { from: 100 * HOUR, to: 300 * HOUR },
      focus: undefined,
      timeframeMilliseconds: HOUR,
    });
    expect(short).toEqual({
      range: { from: 100 * HOUR, to: 300 * HOUR },
      anchor: `range:${100 * HOUR}-${300 * HOUR}`,
    });
    const long = computeCandleWindow({
      extent: EXTENT,
      range: { from: 0, to: 2_500 * HOUR },
      focus: undefined,
      timeframeMilliseconds: HOUR,
    });
    expect(long.range).toEqual({ from: 1_500 * HOUR, to: 2_500 * HOUR });
  });

  test('a focus instant is centered, and a bigger candle widens the window in time', () => {
    const hourly = computeCandleWindow({
      extent: EXTENT,
      range: undefined,
      focus: 1_500 * HOUR,
      timeframeMilliseconds: HOUR,
    });
    expect(hourly).toEqual({
      range: { from: 1_000 * HOUR, to: 2_000 * HOUR },
      anchor: `focus:${1_500 * HOUR}`,
    });
    const fourHours = computeCandleWindow({
      extent: EXTENT,
      range: undefined,
      focus: 1_500 * HOUR,
      timeframeMilliseconds: 4 * HOUR,
    });
    expect(fourHours.range).toEqual({ from: 0, to: 3_000 * HOUR });
  });

  test('a focus near the edges slides the window inside the run, still with a full page', () => {
    const atStart = computeCandleWindow({
      extent: EXTENT,
      range: undefined,
      focus: 100 * HOUR,
      timeframeMilliseconds: HOUR,
    });
    expect(atStart.range).toEqual({ from: 0, to: 1_000 * HOUR });
    const atEnd = computeCandleWindow({
      extent: EXTENT,
      range: undefined,
      focus: 2_950 * HOUR,
      timeframeMilliseconds: HOUR,
    });
    expect(atEnd.range).toEqual({ from: 2_000 * HOUR, to: 3_000 * HOUR });
  });

  test('the series anchor does not change while the run grows at the end (a new closed candle only extends it)', () => {
    const before = computeCandleWindow({
      extent: EXTENT,
      range: undefined,
      focus: undefined,
      timeframeMilliseconds: HOUR,
    });
    const after = computeCandleWindow({
      extent: { from: 0, to: 3_001 * HOUR },
      range: undefined,
      focus: undefined,
      timeframeMilliseconds: HOUR,
    });
    expect(after.anchor).toBe(before.anchor);
    expect(after.range.to - before.range.to).toBe(HOUR);
  });

  test('a short run is completed with context candles before its start, so the chart is not cut at the start', () => {
    const extent = withLeadingContext({ from: 500 * HOUR, to: 530 * HOUR }, HOUR);
    expect(extent).toEqual({ from: 380 * HOUR, to: 530 * HOUR });
    const window = computeCandleWindow({
      extent,
      range: undefined,
      focus: undefined,
      timeframeMilliseconds: HOUR,
    });
    expect(window.range).toEqual({ from: 380 * HOUR, to: 530 * HOUR });
  });

  test('a run with enough candles gets no context, and the context never goes before the epoch', () => {
    const long = { from: 500 * HOUR, to: 900 * HOUR };
    expect(withLeadingContext(long, HOUR)).toEqual(long);
    expect(withLeadingContext({ from: 10 * HOUR, to: 20 * HOUR }, HOUR).from).toBe(0);
  });
});
