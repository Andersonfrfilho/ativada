// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { ReactElement } from 'react';

import { formatPrice } from '../format/format.js';
import { formatDayInZone } from '../format/zoned-time.js';
import { CHART_HEIGHT, type ChartScale, type PriceBounds } from './price-chart.js';
import styles from './PriceChart.module.css';

const LABEL_GAP = 6;
const LABEL_BASELINE = 4;
const DATE_BASELINE = CHART_HEIGHT - 8;

export type PriceChartAxesProps = {
  readonly scale: ChartScale;
  readonly bounds: PriceBounds | undefined;
  readonly range: { readonly from: number; readonly to: number };
  readonly timeZone: string;
};

// Preço mais alto e mais baixo à esquerda, primeiro e último dia embaixo (no fuso do usuário).
export function PriceChartAxes({
  scale,
  bounds,
  range,
  timeZone,
}: PriceChartAxesProps): ReactElement {
  const { plot } = scale;
  return (
    <g className={styles.axes} aria-hidden="true">
      <line
        className={styles.axisLine}
        x1={plot.left}
        x2={plot.right}
        y1={plot.bottom}
        y2={plot.bottom}
      />
      {bounds === undefined ? null : (
        <>
          <text x={plot.left - LABEL_GAP} y={plot.top + LABEL_BASELINE} textAnchor="end">
            {formatPrice(bounds.high)}
          </text>
          <text x={plot.left - LABEL_GAP} y={plot.bottom} textAnchor="end">
            {formatPrice(bounds.low)}
          </text>
        </>
      )}
      <text x={plot.left} y={DATE_BASELINE}>
        {formatDayInZone(range.from, timeZone)}
      </text>
      <text x={plot.right} y={DATE_BASELINE} textAnchor="end">
        {formatDayInZone(range.to - 1, timeZone)}
      </text>
    </g>
  );
}
