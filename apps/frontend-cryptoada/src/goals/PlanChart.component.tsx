// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { ReactElement } from 'react';

import { formatDecimal } from '../format/format.js';
import type { Candle } from '../overview/overview.validation.js';
import styles from './Goals.module.css';
import { mapPlanChart } from './plan-chart.js';

const WIDTH = 640;
const HEIGHT = 260;
const LABEL_OFFSET = 4;

export type PlanChartLevel = {
  readonly key: 'buy' | 'target' | 'stop' | 'now';
  readonly label: string;
  readonly price: string;
};

export type PlanChartProps = {
  readonly candles: readonly Candle[];
  readonly levels: readonly PlanChartLevel[];
  readonly startsAt: number;
  readonly deadlineAt: number;
};

const LEVEL_CLASS = {
  buy: styles.levelBuy,
  target: styles.levelTarget,
  stop: styles.levelStop,
  now: styles.levelNow,
} as const;

type ChartLevelProps = {
  readonly level: PlanChartLevel;
  readonly y: number;
};

function ChartLevel({ level, y }: ChartLevelProps): ReactElement {
  return (
    <g>
      <line
        data-level={level.key}
        className={LEVEL_CLASS[level.key]}
        x1={0}
        x2={WIDTH}
        y1={y.toFixed(1)}
        y2={y.toFixed(1)}
      />
      <text className={styles.chartLabel} x={WIDTH - LABEL_OFFSET} y={y - LABEL_OFFSET}>
        {level.label} {formatDecimal(level.price)}
      </text>
    </g>
  );
}

// À mão, em SVG: o preço dos últimos dias à esquerda e, daqui até o prazo, o preço de compra, o alvo e o stop.
export function PlanChart({ candles, levels, startsAt, deadlineAt }: PlanChartProps): ReactElement {
  const prices = [...candles.map((c) => Number(c.close)), ...levels.map((l) => Number(l.price))];
  const times = [...candles.map((c) => c.openTime), startsAt, deadlineAt];
  const scale = mapPlanChart({ width: WIDTH, height: HEIGHT, prices, times });
  const points = candles
    .map((c) => `${scale.x(c.openTime).toFixed(1)},${scale.y(Number(c.close)).toFixed(1)}`)
    .join(' ');
  return (
    <svg
      className={styles.chart}
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      role="img"
      aria-label="Gráfico do plano: preço e níveis"
    >
      {candles.length === 0 ? null : (
        <polyline data-series="price" className={styles.priceLine} points={points} />
      )}
      {levels.map((level) => (
        <ChartLevel key={level.key} level={level} y={scale.y(Number(level.price))} />
      ))}
    </svg>
  );
}
