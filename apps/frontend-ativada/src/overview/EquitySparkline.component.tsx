// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { ReactElement } from 'react';

import { SPARKLINE_MAX_POINTS } from './overview.constant.js';
import styles from './Overview.module.css';
import type { EquityPoint, Signal } from './overview.validation.js';

const WIDTH = 300;
const HEIGHT = 80;
const PADDING = 4;

export type EquitySparklineProps = {
  readonly points: readonly EquityPoint[];
  readonly signals?: readonly Signal[];
};

const MARKER_SIZE = 4;

function downsample(points: readonly EquityPoint[]): readonly EquityPoint[] {
  if (points.length <= SPARKLINE_MAX_POINTS) return points;
  const step = (points.length - 1) / (SPARKLINE_MAX_POINTS - 1);
  const selected = new Set(
    Array.from({ length: SPARKLINE_MAX_POINTS }, (_, index) => Math.round(index * step)),
  );
  return points.filter((_, index) => selected.has(index));
}

type Range = { readonly min: number; readonly max: number };

function pointAt(params: {
  index: number;
  count: number;
  value: number;
  range: Range;
}): [number, number] {
  const span = params.range.max - params.range.min || 1;
  const stepX = (WIDTH - 2 * PADDING) / Math.max(params.count - 1, 1);
  const x = PADDING + params.index * stepX;
  const y = HEIGHT - PADDING - ((params.value - params.range.min) / span) * (HEIGHT - 2 * PADDING);
  return [x, y];
}

function buildPolyline(values: readonly number[], range: Range): string {
  return values
    .map((value, index) => {
      const [x, y] = pointAt({ index, count: values.length, value, range });
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
}

// Compra é triângulo para cima e venda para baixo: a forma diz o que foi, não só a cor.
function markerShape(action: string, x: number, y: number): string {
  const size = MARKER_SIZE;
  return action === 'BUY'
    ? `${x},${y - size} ${x - size},${y + size} ${x + size},${y + size}`
    : `${x},${y + size} ${x - size},${y - size} ${x + size},${y - size}`;
}

function nearestIndex(points: readonly EquityPoint[], candleTime: number): number | undefined {
  const first = points[0];
  const last = points.at(-1);
  if (first === undefined || last === undefined) return undefined;
  if (candleTime < first.candleTime || candleTime > last.candleTime) return undefined;
  let best = 0;
  points.forEach((point, index) => {
    const current = points[best];
    if (
      current === undefined ||
      Math.abs(point.candleTime - candleTime) < Math.abs(current.candleTime - candleTime)
    ) {
      best = index;
    }
  });
  return best;
}

export function EquitySparkline({ points, signals = [] }: EquitySparklineProps): ReactElement {
  const sampled = downsample(points);
  const equity = sampled.map((point) => Number(point.equity));
  const benchmark = sampled.map((point) => Number(point.benchmark));
  const all = [...equity, ...benchmark];
  const range = { min: Math.min(...all), max: Math.max(...all) };
  const marks = signals.flatMap((signal) => {
    const index = nearestIndex(sampled, signal.candleTime);
    const value = index === undefined ? undefined : equity[index];
    if (index === undefined || value === undefined) return [];
    const [x, y] = pointAt({ index, count: sampled.length, value, range });
    return [{ key: `${signal.candleTime}-${signal.action}`, action: signal.action, x, y }];
  });
  const buys = marks.filter((mark) => mark.action === 'BUY').length;
  const sells = marks.length - buys;
  return (
    <svg
      className={styles.sparkline}
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      role="img"
      aria-label={`Curva do saldo comparada a comprar e segurar, com ${buys} compra(s) e ${sells} venda(s) marcadas`}
    >
      <polyline className={styles.benchmarkLine} points={buildPolyline(benchmark, range)} />
      <polyline className={styles.equityLine} points={buildPolyline(equity, range)} />
      {marks.map((mark) => (
        <polygon
          key={mark.key}
          data-marker={mark.action}
          className={mark.action === 'BUY' ? styles.markerBuy : styles.markerSell}
          points={markerShape(mark.action, mark.x, mark.y)}
        />
      ))}
    </svg>
  );
}
