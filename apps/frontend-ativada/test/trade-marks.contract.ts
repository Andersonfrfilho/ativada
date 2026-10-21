// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, test } from 'bun:test';

import type { SurfaceMarker } from '../src/runs/candle-chart/chart-surface.types.js';
import { describeTradesAt, toSurfaceMarkers } from '../src/runs/candle-chart/marker-series.js';
import { buildMarkColors } from '../src/runs/candle-chart/surface-style.js';
import {
  groupMarks,
  paintBands,
  paintDots,
  paintPill,
  pillText,
  type MarkColors,
  type MarkPlacement,
} from '../src/runs/candle-chart/trade-marks-paint.js';

const HOUR = 3_600_000;

function markOf(side: 'buy' | 'sell', time: number, isSelected = false): SurfaceMarker {
  return {
    key: `${time}:${side}`,
    time,
    side,
    label: side === 'buy' ? 'Compra' : 'Venda',
    price: 12.45,
    priceText: '12,45',
    isSelected,
  };
}

function placed(mark: SurfaceMarker, x: number): MarkPlacement {
  return { mark, x, y: 200 };
}

const COLORS: MarkColors = {
  buy: '#087a52',
  sell: '#c0353d',
  buyBand: 'rgba(8,122,82,0.14)',
  sellBand: 'rgba(192,53,61,0.14)',
  halo: '#ffffff',
  onMark: '#ffffff',
};

type Call = { readonly name: string; readonly args: readonly unknown[] };

function fakeContext(): { readonly context: CanvasRenderingContext2D; readonly calls: Call[] } {
  const calls: Call[] = [];
  const record =
    (name: string) =>
    (...args: unknown[]): void => {
      calls.push({ name, args });
    };
  const target: Record<string, unknown> = {
    measureText: () => ({ width: 80 }),
    fillText: record('fillText'),
    fillRect: record('fillRect'),
    arc: record('arc'),
    roundRect: record('roundRect'),
    beginPath: record('beginPath'),
    fill: record('fill'),
    stroke: record('stroke'),
  };
  return { context: target as unknown as CanvasRenderingContext2D, calls };
}

describe('etiquetas de compra e venda', () => {
  test('a single mark says the arrow, the word and the price; many marks say how many', () => {
    const [single] = groupMarks([placed(markOf('buy', 1), 100)]);
    expect(single === undefined ? '' : pillText(single)).toBe('▲ Compra 12,45');
    const groups = groupMarks([
      placed(markOf('sell', 1), 100),
      placed(markOf('sell', 2), 130),
      placed(markOf('sell', 3), 160),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0] === undefined ? '' : pillText(groups[0])).toBe('▼ Vendas ×3');
  });

  test('buys and sells never share a label, and far apart marks stay separate', () => {
    const groups = groupMarks([
      placed(markOf('buy', 1), 100),
      placed(markOf('sell', 2), 110),
      placed(markOf('buy', 3), 400),
    ]);
    expect(groups.map((group) => [group.side, group.items.length])).toEqual([
      ['buy', 1],
      ['sell', 1],
      ['buy', 1],
    ]);
  });

  test('painting draws the band, the dot with a halo and a labelled pill inside the frame', () => {
    const { context, calls } = fakeContext();
    const marks = [placed(markOf('buy', 1, true), 4), placed(markOf('sell', 2), 300)];
    const frame = { width: 400, height: 300 };
    paintBands(context, marks, { colors: COLORS, frame });
    paintDots(context, marks, COLORS);
    groupMarks(marks).forEach((group) => paintPill(context, group, { colors: COLORS, frame }));
    expect(calls.filter((call) => call.name === 'fillRect')).toHaveLength(2);
    expect(calls.filter((call) => call.name === 'arc')).toHaveLength(2);
    const texts = calls.filter((call) => call.name === 'fillText').map((call) => call.args[0]);
    expect(texts).toEqual(['▲ Compra 12,45', '▼ Venda 12,45']);
    const pills = calls.filter((call) => call.name === 'roundRect');
    for (const pill of pills) {
      const [left, top, width, height] = pill.args;
      expect(Number(left)).toBeGreaterThanOrEqual(0);
      expect(Number(left) + Number(width)).toBeLessThanOrEqual(frame.width);
      expect(Number(top)).toBeGreaterThanOrEqual(0);
      expect(Number(top) + Number(height)).toBeLessThanOrEqual(frame.height);
    }
  });

  test('the colors come from the theme: strong buy and sell, soft bands, halo from the background', () => {
    const colors = buildMarkColors({
      background: '#ffffff',
      text: '#10162a',
      grid: '#ddd',
      up: '#087a52',
      down: '#c0353d',
      line: '#00f',
      coneUp: '#0f0',
      coneDown: '#f00',
      coneNeutral: '#888',
    });
    expect(colors.buy).toBe('#087a52');
    expect(colors.sell).toBe('#c0353d');
    expect(colors.halo).toBe('#ffffff');
    expect(colors.buyBand).not.toBe(colors.buy);
  });
});

describe('dica ao apontar a vela da operação', () => {
  const markers = [
    {
      positionKey: 'p1',
      side: 'buy' as const,
      candleTime: 5 * HOUR + 1_000,
      price: '12.45',
      fee: '0.01',
    },
  ];

  test('says the word, the price and the fee for the pointed candle and nothing for others', () => {
    expect(describeTradesAt(markers, 5 * HOUR, HOUR)).toBe('Compra a 12,45 · taxa 0,01');
    expect(describeTradesAt(markers, 6 * HOUR, HOUR)).toBeUndefined();
    expect(describeTradesAt(null, 5 * HOUR, HOUR)).toBeUndefined();
  });

  test('the surface marker carries the exact fill price for drawing and for the label', () => {
    const [marker] = toSurfaceMarkers(markers, HOUR);
    expect(marker?.price).toBe(12.45);
    expect(marker?.priceText).toBe('12,45');
  });
});
