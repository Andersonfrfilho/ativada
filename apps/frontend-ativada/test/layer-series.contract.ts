// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, test } from 'bun:test';

import {
  computeLayersWindow,
  describeScorePanel,
  formatThreshold,
  LAYERS_BLOCK_BARS,
  toLevelBoxes,
  toWaitedTimes,
} from '../src/runs/candle-chart/layer-series.js';
import type { Trade } from '../src/runs/run.validation.js';

const HOUR = 3_600_000;
const EXTENT = { from: 0, to: 5_000 * HOUR };

describe('janela das camadas da estratégia', () => {
  test('is at most 1,000 candles around the center, moving in blocks of 250', () => {
    const center = 2_000 * HOUR;
    const window = computeLayersWindow({
      centerTime: center,
      extent: EXTENT,
      timeframeMilliseconds: HOUR,
    });
    expect(window).toEqual({ from: 1_625 * HOUR, to: 2_625 * HOUR });
    expect(window !== undefined && window.from <= center && center < window.to).toBe(true);
    const sameBlock = computeLayersWindow({
      centerTime: center + (LAYERS_BLOCK_BARS - 1) * HOUR,
      extent: EXTENT,
      timeframeMilliseconds: HOUR,
    });
    expect(sameBlock).toEqual(window);
    const nextBlock = computeLayersWindow({
      centerTime: center + LAYERS_BLOCK_BARS * HOUR,
      extent: EXTENT,
      timeframeMilliseconds: HOUR,
    });
    expect(nextBlock).toEqual({ from: 1_875 * HOUR, to: 2_875 * HOUR });
  });

  test('never leaves the run (outside it the API answers 400) and never passes 1,000 candles', () => {
    const early = computeLayersWindow({
      centerTime: 10 * HOUR,
      extent: EXTENT,
      timeframeMilliseconds: HOUR,
    });
    expect(early).toEqual({ from: 0, to: 625 * HOUR });
    const late = computeLayersWindow({
      centerTime: 4_990 * HOUR,
      extent: EXTENT,
      timeframeMilliseconds: HOUR,
    });
    expect(late).toEqual({ from: 4_375 * HOUR, to: 5_000 * HOUR });
    for (const center of [0, 123 * HOUR, 2_500 * HOUR, 4_999 * HOUR]) {
      const window = computeLayersWindow({
        centerTime: center,
        extent: EXTENT,
        timeframeMilliseconds: HOUR,
      });
      expect(window !== undefined && (window.to - window.from) / HOUR <= 1_000).toBe(true);
    }
  });

  test('has no window outside the run or without a candle size', () => {
    expect(
      computeLayersWindow({
        centerTime: 9_000 * HOUR,
        extent: EXTENT,
        timeframeMilliseconds: HOUR,
      }),
    ).toBeUndefined();
    expect(
      computeLayersWindow({ centerTime: 1, extent: EXTENT, timeframeMilliseconds: 0 }),
    ).toBeUndefined();
  });
});

function buildTrade(overrides: Partial<Trade>): Trade {
  return {
    engineKey: 'p1',
    status: 'closed',
    entryPrice: '609',
    quantity: '0.5',
    openedCandleTime: 3_600_000,
    ...overrides,
  };
}

describe('caixas de stop e alvo', () => {
  test('a closed trade goes from entry to exit; an open one runs to the right edge (null)', () => {
    const boxes = toLevelBoxes([
      buildTrade({ stopPrice: '600.5', targetPrice: '620', closedCandleTime: 10_800_000 }),
      buildTrade({ engineKey: 'p2', status: 'open', stopPrice: '610', targetPrice: '630.25' }),
    ]);
    expect(boxes).toStrictEqual([
      { key: 'p1', entryTime: 3_600, exitTime: 10_800, entry: 609, stop: 600.5, target: 620 },
      { key: 'p2', entryTime: 3_600, exitTime: null, entry: 609, stop: 610, target: 630.25 },
    ]);
  });

  test('a trade without stop or target (older API) draws nothing, never a guess', () => {
    expect(toLevelBoxes([buildTrade({}), buildTrade({ stopPrice: '600' })])).toStrictEqual([]);
  });
});

describe('pontinhos de "esperou"', () => {
  test('only the waited decisions become dots, and none without decisions', () => {
    const decisions = [
      {
        candleTime: 3_600_000,
        closedAt: 7_200_000,
        action: 'HOLD',
        outcome: 'waited',
        score: '1',
        scoreThreshold: '2',
      },
      {
        candleTime: 7_200_000,
        closedAt: 10_800_000,
        action: 'BUY',
        outcome: 'bought',
        score: '2',
        scoreThreshold: '2',
      },
      {
        candleTime: 10_800_000,
        closedAt: 14_400_000,
        action: 'HOLD',
        outcome: 'waited',
        score: '0',
        scoreThreshold: '2',
      },
    ] as const;
    expect(toWaitedTimes(decisions)).toStrictEqual([3_600, 10_800]);
    expect(toWaitedTimes(null)).toStrictEqual([]);
  });
});

describe('rótulo do painel do placar', () => {
  test('signs, true minus and decimal comma', () => {
    expect(formatThreshold('2')).toBe('+2');
    expect(formatThreshold('-2')).toBe('−2');
    expect(formatThreshold('1.5')).toBe('+1,5');
    expect(formatThreshold('-0.25')).toBe('−0,25');
    expect(formatThreshold('0')).toBe('0');
    expect(formatThreshold('abc')).toBe('—');
  });

  test('says where buying and selling happen, from the last segment of the version', () => {
    expect(
      describeScorePanel([
        { from: 0, to: 10, buy: '3', sell: '-3' },
        { from: 10, to: 20, buy: '2', sell: '-2' },
      ]),
    ).toBe('Placar da estratégia — compra em +2, venda em −2');
    expect(describeScorePanel([])).toBe('Placar da estratégia');
  });
});
