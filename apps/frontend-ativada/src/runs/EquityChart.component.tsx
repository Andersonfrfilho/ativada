// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { ReactElement } from 'react';

import { formatChangePercent, formatDate } from '../format/format.js';
import { Card } from '../layout/Card.component.js';
import styles from './EquityChart.module.css';

export type ChartLine = {
  readonly label: string;
  readonly tone: 'strategy' | 'benchmark' | 'second';
  readonly points: readonly { readonly time: number; readonly ratio: number }[];
};

const WIDTH = 640;
const HEIGHT = 220;
const PAD_LEFT = 46;
const PAD = 10;
const PAD_BOTTOM = 22;

type Bounds = { minTime: number; maxTime: number; minRatio: number; maxRatio: number };

function computeBounds(lines: readonly ChartLine[]): Bounds {
  const points = lines.flatMap((line) => line.points);
  const times = points.map((point) => point.time);
  const ratios = [0, ...points.map((point) => point.ratio)];
  return {
    minTime: Math.min(...times),
    maxTime: Math.max(...times),
    minRatio: Math.min(...ratios),
    maxRatio: Math.max(...ratios),
  };
}

function project(bounds: Bounds, point: { time: number; ratio: number }): string {
  const spanTime = bounds.maxTime - bounds.minTime || 1;
  const spanRatio = bounds.maxRatio - bounds.minRatio || 1;
  const x = PAD_LEFT + ((point.time - bounds.minTime) / spanTime) * (WIDTH - PAD_LEFT - PAD);
  const y =
    HEIGHT -
    PAD_BOTTOM -
    ((point.ratio - bounds.minRatio) / spanRatio) * (HEIGHT - PAD - PAD_BOTTOM);
  return `${x.toFixed(1)},${y.toFixed(1)}`;
}

function describe(lines: readonly ChartLine[]): string {
  return lines
    .map((line) => {
      const last = line.points.at(-1);
      return `${line.label}: ${last === undefined ? 'sem dados' : formatChangePercent(last.ratio)}`;
    })
    .join('; ');
}

export type EquityChartProps = { readonly lines: readonly ChartLine[] };

function AxisLabels({ bounds }: { readonly bounds: Bounds }): ReactElement {
  return (
    <>
      <text x={2} y={PAD + 8}>
        {formatChangePercent(bounds.maxRatio)}
      </text>
      <text x={2} y={HEIGHT - PAD_BOTTOM}>
        {formatChangePercent(bounds.minRatio)}
      </text>
      <text x={PAD_LEFT} y={HEIGHT - 4}>
        {formatDate(bounds.minTime)}
      </text>
      <text x={WIDTH - PAD} y={HEIGHT - 4} textAnchor="end">
        {formatDate(bounds.maxTime)}
      </text>
    </>
  );
}

function Legend({ lines }: { readonly lines: readonly ChartLine[] }): ReactElement {
  return (
    <ul className={styles.legend}>
      {lines.map((line) => (
        <li key={line.label}>
          <i className={`${styles.swatch} ${styles[`${line.tone}Swatch`]}`} aria-hidden="true" />
          {line.label}
        </li>
      ))}
    </ul>
  );
}

// Gráfico leve em SVG, sem biblioteca: retorno acumulado desde o capital inicial, uma linha por série.
export function EquityChart({ lines }: EquityChartProps): ReactElement {
  const bounds = computeBounds(lines);
  const zero = project(bounds, { time: bounds.minTime, ratio: 0 }).split(',')[1] ?? '0';
  return (
    <Card title="Curva de patrimônio">
      <svg
        className={styles.chart}
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        role="img"
        aria-label={`Retorno acumulado. ${describe(lines)}`}
      >
        <line className={styles.zero} x1={PAD_LEFT} x2={WIDTH - PAD} y1={zero} y2={zero} />
        {lines.map((line) => (
          <polyline
            key={line.label}
            className={styles[line.tone]}
            points={line.points.map((point) => project(bounds, point)).join(' ')}
          />
        ))}
        <AxisLabels bounds={bounds} />
      </svg>
      <Legend lines={lines} />
    </Card>
  );
}
