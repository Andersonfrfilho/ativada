// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { ReactElement } from 'react';

import { SPARKLINE_MAX_POINTS } from './overview.constant.js';
import styles from './Overview.module.css';
import type { EquityPoint } from './overview.validation.js';

const WIDTH = 300;
const HEIGHT = 80;
const PADDING = 4;

export type EquitySparklineProps = { readonly points: readonly EquityPoint[] };

function downsample(points: readonly EquityPoint[]): readonly EquityPoint[] {
  if (points.length <= SPARKLINE_MAX_POINTS) return points;
  const step = (points.length - 1) / (SPARKLINE_MAX_POINTS - 1);
  const selected = new Set(
    Array.from({ length: SPARKLINE_MAX_POINTS }, (_, index) => Math.round(index * step)),
  );
  return points.filter((_, index) => selected.has(index));
}

function buildPolyline(values: readonly number[], range: { min: number; max: number }): string {
  const span = range.max - range.min || 1;
  const stepX = (WIDTH - 2 * PADDING) / Math.max(values.length - 1, 1);
  return values
    .map((value, index) => {
      const x = PADDING + index * stepX;
      const y = HEIGHT - PADDING - ((value - range.min) / span) * (HEIGHT - 2 * PADDING);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
}

export function EquitySparkline({ points }: EquitySparklineProps): ReactElement {
  const sampled = downsample(points);
  const equity = sampled.map((point) => Number(point.equity));
  const benchmark = sampled.map((point) => Number(point.benchmark));
  const all = [...equity, ...benchmark];
  const range = { min: Math.min(...all), max: Math.max(...all) };
  return (
    <svg
      className={styles.sparkline}
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      role="img"
      aria-label="Curva do saldo comparada a comprar e segurar"
    >
      <polyline className={styles.benchmarkLine} points={buildPolyline(benchmark, range)} />
      <polyline className={styles.equityLine} points={buildPolyline(equity, range)} />
    </svg>
  );
}
