// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, test } from 'bun:test';

import {
  buildBandPoints,
  buildLinePoints,
  CHART_HEIGHT,
  CHART_WIDTH,
  chartColumnsFor,
  createChartScale,
  findPriceBounds,
  MAX_PATH_POINTS,
  toPathData,
} from '../src/runs/price-chart.js';
import {
  clusterKey,
  describeCluster,
  markerKey,
  placeCluster,
  placeMarker,
  sortMarkers,
} from '../src/runs/price-chart-markers.js';
import type { ChartMarker, PriceColumn } from '../src/runs/trade-chart.validation.js';

const BOUNDS = { low: '100', high: '200' };
const RANGE = { from: 0, to: 1_000, bounds: BOUNDS };

function column(index: number, overrides: Partial<PriceColumn> = {}): PriceColumn {
  return {
    startTime: index * 100,
    endTime: index * 100 + 99,
    first: '120',
    last: '150',
    low: '110',
    high: '190',
    ...overrides,
  };
}

function marker(overrides: Partial<ChartMarker> = {}): ChartMarker {
  return {
    positionKey: 'p1',
    side: 'buy',
    candleTime: 500,
    price: '150',
    quantity: '1',
    fee: '0.1',
    amount: '150.1',
    ...overrides,
  };
}

// Gerador determinístico: o teste de propriedades repete igual em qualquer máquina.
function createSequence(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1_103_515_245 + 12_345) % 2_147_483_648;
    return state / 2_147_483_648;
  };
}

describe('createChartScale: contas à mão', () => {
  const scale = createChartScale(RANGE);

  test('time maps linearly onto the plot area', () => {
    expect(scale.plot).toEqual({ left: 62, right: 624, top: 18, bottom: 272 });
    expect(scale.x(0)).toBe(62);
    expect(scale.x(500)).toBe(343);
    expect(scale.x(1_000)).toBe(624);
  });

  test('higher price is higher on screen, with 6% of padding on both ends', () => {
    expect(scale.y(206)).toBeCloseTo(18, 9);
    expect(scale.y(150)).toBeCloseTo(145, 9);
    expect(scale.y(94)).toBeCloseTo(272, 9);
    expect(scale.y(200)).toBeLessThan(scale.y(100));
  });

  test('flat price and empty period go to the middle instead of dividing by zero', () => {
    const flat = createChartScale({ from: 5, to: 5, bounds: { low: '10', high: '10' } });
    expect(flat.x(5)).toBe(343);
    expect(flat.y(10)).toBe(145);
    expect(createChartScale({ from: 0, to: 1, bounds: undefined }).y(1)).toBe(145);
  });
});

describe('findPriceBounds', () => {
  test('compares as decimals, not as text, and returns the server text', () => {
    const columns = [
      column(0, { low: '9.5', high: '20' }),
      column(1, { low: '10.25', high: '100.5' }),
      column(2, { low: '8.75', high: '99' }),
    ];
    expect(findPriceBounds(columns)).toEqual({ low: '8.75', high: '100.5' });
  });

  test('has no bounds without columns', () => {
    expect(findPriceBounds([])).toBeUndefined();
  });
});

describe('line and band', () => {
  const scale = createChartScale(RANGE);

  test('the line goes through the close (last) of each column, at the middle of the column', () => {
    const points = buildLinePoints(scale, [column(0), column(1, { last: '200' })]);
    expect(points).toHaveLength(2);
    expect(points[0]?.x).toBeCloseTo(62 + (49.5 / 1_000) * 562, 9);
    expect(points[0]?.y).toBeCloseTo(145, 9);
    expect(points[1]?.y).toBeCloseTo(18 + (6 / 112) * 254, 9);
  });

  test('a column without a readable price does not break the line', () => {
    const columns = [column(0), column(1, { last: 'sem preço' }), column(2)];
    const points = buildLinePoints(scale, columns);
    expect(points).toHaveLength(2);
    expect(points.every((point) => Number.isFinite(point.x) && Number.isFinite(point.y))).toBe(
      true,
    );
    expect(toPathData(points, false)).not.toContain('NaN');
  });

  test('the band walks the highs forward and the lows back, closed', () => {
    const points = buildBandPoints(scale, [column(0), column(1)]);
    expect(points).toHaveLength(4);
    expect(points[0]?.y).toBeLessThan(points[3]?.y ?? 0);
    expect(points[0]?.x).toBe(points[3]?.x ?? -1);
    expect(toPathData(points, true).endsWith(' Z')).toBe(true);
  });

  test('path data: M first, L after, empty for no points', () => {
    expect(
      toPathData(
        [
          { x: 1, y: 2 },
          { x: 3.14159, y: 4 },
        ],
        false,
      ),
    ).toBe('M1.0,2.0 L3.1,4.0');
    expect(toPathData([], true)).toBe('');
  });
});

describe('line and band: propriedades', () => {
  const next = createSequence(7);
  const scale = createChartScale({ from: 0, to: 10_000_000, bounds: { low: '0', high: '1000' } });

  function randomColumns(count: number): PriceColumn[] {
    return Array.from({ length: count }, (_, index) => {
      const low = next() * 900;
      return {
        startTime: index * 2_000,
        endTime: index * 2_000 + 1_999,
        first: low.toFixed(2),
        last: (low + 50).toFixed(2),
        low: low.toFixed(2),
        high: (low + 100).toFixed(2),
      };
    });
  }

  test('never passes 2,000 points, however many columns arrive', () => {
    for (const count of [1, 100, 2_000, 2_001, 4_999]) {
      const columns = randomColumns(count);
      expect(buildLinePoints(scale, columns).length).toBeLessThanOrEqual(MAX_PATH_POINTS);
      expect(buildBandPoints(scale, columns).length).toBeLessThanOrEqual(MAX_PATH_POINTS);
    }
  });

  test('time order is preserved: x never goes back along the line', () => {
    const points = buildLinePoints(scale, randomColumns(4_999));
    for (let index = 1; index < points.length; index += 1) {
      expect(points[index]?.x ?? -1).toBeGreaterThanOrEqual(points[index - 1]?.x ?? Infinity);
    }
  });

  test('the sampled line keeps the first and the last column', () => {
    const columns = randomColumns(4_999);
    const points = buildLinePoints(scale, columns);
    expect(points[0]?.x).toBeCloseTo(scale.x((0 + 1_999) / 2), 9);
    expect(points.at(-1)?.x).toBeCloseTo(scale.x(4_998 * 2_000 + 999.5), 9);
  });

  test('every point is inside the drawing', () => {
    for (const point of [
      ...buildLinePoints(scale, randomColumns(300)),
      ...buildBandPoints(scale, randomColumns(300)),
    ]) {
      expect(point.x).toBeGreaterThanOrEqual(0);
      expect(point.x).toBeLessThanOrEqual(CHART_WIDTH);
      expect(point.y).toBeGreaterThanOrEqual(0);
      expect(point.y).toBeLessThanOrEqual(CHART_HEIGHT);
    }
  });
});

describe('placeMarker', () => {
  const scale = createChartScale(RANGE);

  test('a buy sits BELOW the price with an arrow pointing up (tip on top)', () => {
    const placed = placeMarker(scale, marker());
    expect(placed.x).toBe(343);
    expect(placed.centerY).toBeCloseTo(145 + 14, 9);
    expect(placed.path).toBe(
      'M343.0,150.0 L350.0,159.0 L346.0,159.0 L346.0,168.0 L340.0,168.0 L340.0,159.0 L336.0,159.0 Z',
    );
  });

  test('a sell sits ABOVE the price with an arrow pointing down (tip on the bottom)', () => {
    const placed = placeMarker(scale, marker({ side: 'sell' }));
    expect(placed.centerY).toBeCloseTo(145 - 14, 9);
    expect(placed.path).toBe(
      'M343.0,140.0 L350.0,131.0 L346.0,131.0 L346.0,122.0 L340.0,122.0 L340.0,131.0 L336.0,131.0 Z',
    );
  });

  test('buy and sell differ by shape, not only by position', () => {
    const buy = placeMarker(scale, marker());
    const sell = placeMarker(scale, marker({ side: 'sell' }));
    expect(buy.path).not.toBe(sell.path);
    expect(buy.side).toBe('buy');
    expect(sell.side).toBe('sell');
  });

  test('near the edge of the drawing the arrow is pushed back inside', () => {
    expect(placeMarker(scale, marker({ side: 'sell', price: '206' })).centerY).toBe(16);
    expect(placeMarker(scale, marker({ price: '94' })).centerY).toBe(CHART_HEIGHT - 16);
    expect(placeMarker(scale, marker({ candleTime: 5_000 })).x).toBe(624);
    expect(placeMarker(scale, marker({ candleTime: -5 })).x).toBe(62);
  });

  test('property: every marker, with its touch area, is inside the SVG', () => {
    const next = createSequence(11);
    for (let index = 0; index < 500; index += 1) {
      const side = next() < 0.5 ? 'buy' : 'sell';
      const price = (80 + next() * 140).toFixed(2);
      const candleTime = Math.round(next() * 1_400 - 200);
      const placed = placeMarker(scale, marker({ side, price, candleTime }));
      const numbers = [...placed.path.matchAll(/(-?\d+\.\d)/g)].map((match) => Number(match[1]));
      const xs = numbers.filter((_, position) => position % 2 === 0);
      const ys = numbers.filter((_, position) => position % 2 === 1);
      expect(Math.min(...xs)).toBeGreaterThanOrEqual(0);
      expect(Math.max(...xs)).toBeLessThanOrEqual(CHART_WIDTH);
      expect(Math.min(...ys)).toBeGreaterThanOrEqual(0);
      expect(Math.max(...ys)).toBeLessThanOrEqual(CHART_HEIGHT);
      expect(placed.centerY - 16).toBeGreaterThanOrEqual(0);
      expect(placed.centerY + 16).toBeLessThanOrEqual(CHART_HEIGHT);
      expect(placed.x + 16).toBeLessThanOrEqual(CHART_WIDTH);
    }
  });
});

describe('clusters', () => {
  const scale = createChartScale(RANGE);
  const columns = Array.from({ length: 10 }, (_, index) =>
    column(index, { last: String(100 + index * 10) }),
  );

  test('label: counts with singular and plural, a zero side disappears', () => {
    expect(describeCluster({ startTime: 0, endTime: 1, buys: 12, sells: 11 })).toBe(
      '12 compras, 11 vendas',
    );
    expect(describeCluster({ startTime: 0, endTime: 1, buys: 1, sells: 1 })).toBe(
      '1 compra, 1 venda',
    );
    expect(describeCluster({ startTime: 0, endTime: 1, buys: 0, sells: 3 })).toBe('3 vendas');
  });

  test('position: on the price line of its own column; radius grows with the count', () => {
    const cluster = { startTime: 400, endTime: 600, buys: 12, sells: 11 };
    const placed = placeCluster(scale, columns, cluster);
    expect(placed.x).toBe(343);
    expect(placed.y).toBeCloseTo(scale.y(150), 9);
    expect(placed.count).toBe(23);
    expect(placed.radius).toBeCloseTo(9 + Math.log2(23), 9);
    expect(placed.label).toBe('12 compras, 11 vendas');
    const bigger = placeCluster(scale, columns, { ...cluster, buys: 5_000 });
    expect(bigger.radius).toBe(18);
    expect(placeCluster(scale, columns, { ...cluster, buys: 1, sells: 0 }).radius).toBe(9);
  });

  test('without price columns it sits in the middle, still inside the drawing', () => {
    const placed = placeCluster(scale, [], { startTime: 0, endTime: 10, buys: 1, sells: 0 });
    expect(placed.y).toBe(145);
    expect(placed.x - placed.radius).toBeGreaterThanOrEqual(0);
  });

  test('property: every cluster circle is inside the SVG', () => {
    const next = createSequence(3);
    for (let index = 0; index < 300; index += 1) {
      const start = Math.round(next() * 1_000);
      const cluster = {
        startTime: start,
        endTime: start + 50,
        buys: Math.round(next() * 400),
        sells: Math.round(next() * 400),
      };
      const placed = placeCluster(scale, columns, cluster);
      expect(placed.x - placed.radius).toBeGreaterThanOrEqual(0);
      expect(placed.x + placed.radius).toBeLessThanOrEqual(CHART_WIDTH);
      expect(placed.y - placed.radius).toBeGreaterThanOrEqual(0);
      expect(placed.y + placed.radius).toBeLessThanOrEqual(CHART_HEIGHT);
    }
  });
});

describe('helpers', () => {
  test('columns follow the width of the drawing, inside the contract limits', () => {
    expect(chartColumnsFor(640)).toBe(640);
    expect(chartColumnsFor(10)).toBe(100);
    expect(chartColumnsFor(99_999)).toBe(2_000);
    expect(chartColumnsFor(640.6)).toBe(641);
  });

  test('markers are put in time order and keys are unique per marker and per cluster', () => {
    const late = marker({ candleTime: 900 });
    const early = marker({ side: 'sell', candleTime: 100 });
    expect(sortMarkers([late, early])).toEqual([early, late]);
    expect(markerKey(late)).not.toBe(markerKey(early));
    expect(clusterKey({ startTime: 5, endTime: 9, buys: 1, sells: 0 })).toBe('cluster:5');
  });
});
